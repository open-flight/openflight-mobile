import { useSessionStore } from '../stores/useSessionStore';
import type { Shot } from '../types';

// Minimal Shot factory — only the fields the store cares about (identity/order)
// need to be distinct; the rest are filled with representative values.
function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    shot_number: 1,
    ball_speed_mph: 100,
    club_speed_mph: 70,
    smash_factor: 1.43,
    estimated_carry_yards: 250,
    carry_spin_adjusted: null,
    carry_range: [240, 260],
    club: 'driver',
    profile_id: null,
    profile_name: null,
    timestamp: '2026-08-18T00:00:00Z',
    launch_angle_vertical: null,
    launch_angle_horizontal: null,
    launch_angle_confidence: null,
    angle_source: null,
    club_angle_deg: null,
    club_path_deg: null,
    spin_axis_deg: null,
    spin_rpm: null,
    spin_source: null,
    spin_quality: null,
    ...overrides,
  };
}

describe('session identity', () => {
  it('starts a session so the shots of one visit can be grouped together', () => {
    useSessionStore.getState().startSession();

    expect(useSessionStore.getState().sessionId).toEqual(expect.any(String));
  });

  it('gives each visit its own id, even two in the same millisecond', () => {
    // A session is one connection span; reconnecting twice in quick succession
    // must not merge those visits into a single history entry.
    useSessionStore.getState().startSession();
    const first = useSessionStore.getState().sessionId;

    useSessionStore.getState().startSession();

    expect(useSessionStore.getState().sessionId).not.toBe(first);
  });
});

// Reset to initial state between tests — the store is a module singleton.
beforeEach(() => {
  useSessionStore.setState({ connectionState: 'disconnected', shots: [] });
});

describe('useSessionStore', () => {
  it('starts disconnected with no shots', () => {
    const state = useSessionStore.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.shots).toEqual([]);
  });

  it('setConnectionState transitions through the connection lifecycle', () => {
    const { setConnectionState } = useSessionStore.getState();
    setConnectionState('connecting');
    expect(useSessionStore.getState().connectionState).toBe('connecting');
    setConnectionState('connected');
    expect(useSessionStore.getState().connectionState).toBe('connected');
    setConnectionState('error');
    expect(useSessionStore.getState().connectionState).toBe('error');
  });

  it('setShots inverts server (oldest-first) order into newest-first', () => {
    const oldest = makeShot({ timestamp: 't1' });
    const newest = makeShot({ timestamp: 't3' });
    // Server sends oldest-first.
    useSessionStore.getState().setShots([oldest, makeShot({ timestamp: 't2' }), newest]);

    const shots = useSessionStore.getState().shots;
    expect(shots[0].timestamp).toBe('t3');
    expect(shots[2].timestamp).toBe('t1');
  });

  it('setShots does not mutate the caller-supplied array', () => {
    const input = [makeShot({ timestamp: 't1' }), makeShot({ timestamp: 't2' })];
    useSessionStore.getState().setShots(input);
    // reverse() on a copy, not in place.
    expect(input[0].timestamp).toBe('t1');
  });

  it('addShot prepends the new shot as the latest', () => {
    useSessionStore.getState().setShots([makeShot({ timestamp: 't1' })]);
    useSessionStore.getState().addShot(makeShot({ timestamp: 't2' }));

    const shots = useSessionStore.getState().shots;
    expect(shots).toHaveLength(2);
    expect(shots[0].timestamp).toBe('t2');
    expect(shots[1].timestamp).toBe('t1');
  });

  it('clearShots empties the list', () => {
    useSessionStore.getState().setShots([makeShot(), makeShot()]);
    useSessionStore.getState().clearShots();
    expect(useSessionStore.getState().shots).toEqual([]);
  });
});

describe('an enriched shot replacing its provisional version', () => {
  it('updates the shot in place instead of listing it twice', () => {
    // The server publishes provisional metrics as `shot`, then republishes the
    // same shot_number as `shot_update` once optional hardware finishes. Both
    // land on the live list, so without matching on shot_number the player
    // sees one swing as two.
    useSessionStore.getState().addShot(makeShot({ shot_number: 7, spin_rpm: null }));

    useSessionStore.getState().replaceShot(makeShot({ shot_number: 7, spin_rpm: 2680 }));

    const shots = useSessionStore.getState().shots;
    expect(shots).toHaveLength(1);
    expect(shots[0].spin_rpm).toBe(2680);
  });

  it('leaves the other shots of the session where they were', () => {
    // An update for an earlier shot must not reorder the list around it.
    useSessionStore
      .getState()
      .setShots([
        makeShot({ shot_number: 1, club: '7 iron' }),
        makeShot({ shot_number: 2, club: 'driver' }),
      ]);

    useSessionStore
      .getState()
      .replaceShot(makeShot({ shot_number: 1, club: '7 iron', spin_rpm: 6820 }));

    const shots = useSessionStore.getState().shots;
    expect(shots.map((shot) => shot.shot_number)).toEqual([2, 1]);
    expect(shots[1].spin_rpm).toBe(6820);
  });

  it('keeps an update for a shot it never saw rather than dropping it', () => {
    // A phone that connects mid-flight can receive the update without the
    // provisional shot that preceded it; losing that shot would be worse than
    // showing it late.
    useSessionStore.getState().replaceShot(makeShot({ shot_number: 9 }));

    expect(useSessionStore.getState().shots).toHaveLength(1);
  });

  it('keeps an unnumbered update rather than matching it to the wrong shot', () => {
    // shot_number is nullable on the wire; two nulls are not the same shot.
    useSessionStore.getState().addShot(makeShot({ shot_number: null, club: 'driver' }));

    useSessionStore.getState().replaceShot(makeShot({ shot_number: null, club: '7 iron' }));

    expect(useSessionStore.getState().shots).toHaveLength(2);
  });
});

// Swing-speed mode reuses the `shot` event but serializes a different key set:
// swing_speed_to_shot_dict() omits shot_number entirely rather than sending it
// as null (server.py:4322-4374). The null guards below are correct; what was
// missing is normalising an absent key, which arrives as undefined and is not
// === null, so it slipped past them. The factories above always supply
// shot_number, so no existing test reaches this path — these build the payload
// the way the server actually sends it.
describe('a shot the server could not number', () => {
  // Strip the key rather than setting it undefined, so the object matches a
  // JSON.parse of the real payload.
  function makeUnnumberedShot(overrides: Partial<Shot> = {}): Shot {
    const shot = makeShot(overrides);
    delete (shot as Partial<Shot>).shot_number;
    return shot;
  }

  it('follows the same append-never-merge rule as an explicit null', () => {
    // An absent key and an explicit null both mean "the server could not
    // number this shot", so both must append. Before this was normalised,
    // undefined slipped past the null guard and matched the first unnumbered
    // shot on the list — overwriting a different swing.
    useSessionStore.getState().addShot(makeUnnumberedShot({ timestamp: 't1', club: 'driver' }));

    useSessionStore.getState().replaceShot(makeUnnumberedShot({ timestamp: 't2', club: '7 iron' }));

    expect(useSessionStore.getState().shots).toHaveLength(2);
  });

  it('leaves a numbered shot alone when an unnumbered one arrives', () => {
    // A swing-speed rep must never land on a launch-monitor shot.
    useSessionStore.getState().addShot(makeShot({ shot_number: 7, club: 'driver' }));

    useSessionStore.getState().replaceShot(makeUnnumberedShot({ timestamp: 't9', club: '7 iron' }));

    const shots = useSessionStore.getState().shots;
    expect(shots).toHaveLength(2);
    expect(shots.find((shot) => shot.shot_number === 7)?.club).toBe('driver');
  });
});
