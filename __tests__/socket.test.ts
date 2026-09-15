import { socketService } from '../services/socket';
import { useSessionStore } from '../stores/useSessionStore';
import { useProfileStore } from '../stores/useProfileStore';
import type { Profile, ProfilesSnapshot, Shot } from '../types';

// Fake Socket.IO socket. The fake is built *inside* the mock factory (not
// captured from an outer const) so it exists by the time `services/socket`
// requires 'socket.io-client' during import — outer consts would still be in
// their temporal dead zone at that point. The internals are exposed on `__mock`
// and pulled back out with requireMock below.
jest.mock('socket.io-client', () => {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const emit = jest.fn();
  const close = jest.fn();
  const io = jest.fn((_url: string, _opts?: unknown) => ({
    on: (event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
    },
    emit,
    close,
  }));
  return { io, __mock: { handlers, emit, close } };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Stand-in for the on-device history. Built inside the factory for the same
// temporal-dead-zone reason as the socket fake above; the repository itself is
// covered against a real database in shotRepository.test.ts.
jest.mock('../storage/db', () => {
  const saveShot = jest.fn(() => Promise.resolve());
  return {
    getShotRepository: jest.fn(() => Promise.resolve({ saveShot })),
    __mock: { saveShot },
  };
});

const dbMock = jest.requireMock('../storage/db') as {
  getShotRepository: jest.Mock;
  __mock: { saveShot: jest.Mock };
};
const { saveShot: mockSaveShot } = dbMock.__mock;

// Persistence is deliberately fire-and-forget, so the write lands a microtask
// after the event; flush before asserting on it.
const flushPendingWrites = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

const socketMock = jest.requireMock('socket.io-client') as {
  io: jest.Mock;
  __mock: {
    handlers: Record<string, (...args: unknown[]) => void>;
    emit: jest.Mock;
    close: jest.Mock;
  };
};
const { io: mockIo } = socketMock;
const { emit: mockEmit, close: mockClose, handlers: mockHandlers } = socketMock.__mock;

function trigger(event: string, ...args: unknown[]) {
  mockHandlers[event]?.(...args);
}

function makeShot(timestamp: string, overrides: Partial<Shot> = {}): Shot {
  return {
    shot_number: 1,
    ball_speed_mph: 100,
    club_speed_mph: null,
    smash_factor: null,
    estimated_carry_yards: 250,
    carry_spin_adjusted: null,
    carry_range: [240, 260],
    club: 'driver',
    profile_id: null,
    profile_name: null,
    timestamp,
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

beforeEach(() => {
  useSessionStore.setState({ connectionState: 'disconnected', sessionId: null, shots: [] });
  // The profile store is a module singleton too; without this a roster can
  // survive into the next test and let an assertion pass for the wrong reason.
  useProfileStore.getState().reset();
  for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
  mockIo.mockClear();
  mockEmit.mockClear();
  mockClose.mockClear();
  mockSaveShot.mockClear();
  mockSaveShot.mockResolvedValue(undefined);
});

afterEach(() => {
  socketService.disconnect();
});

describe('socketService', () => {
  it('opens a connection and reports connecting', () => {
    socketService.connect('http://host:8080');
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenCalledWith(
      'http://host:8080',
      expect.objectContaining({ reconnection: true }),
    );
    expect(useSessionStore.getState().connectionState).toBe('connecting');
  });

  it('ignores a repeated connect to the same address while connecting', () => {
    socketService.connect('http://host:8080');
    socketService.connect('http://host:8080');
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeated connect to the same address while connected', () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    socketService.connect('http://host:8080');
    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  it('replaces an in-flight attempt when the address changes', () => {
    // Regression: the guard keyed only on connection state, so a mistyped
    // address could not be corrected. Tapping Connect again was swallowed and
    // the field stayed editable but inert until Socket.IO's 20s default timeout
    // elapsed, with no feedback that the tap had done nothing.
    socketService.connect('http://typo:8080');
    socketService.connect('http://host:8080');

    expect(mockIo).toHaveBeenCalledTimes(2);
    expect(mockIo).toHaveBeenLastCalledWith('http://host:8080', expect.any(Object));
    expect(mockClose).toHaveBeenCalledTimes(1); // the abandoned attempt is torn down
    expect(useSessionStore.getState().connectionState).toBe('connecting');
  });

  it('reconnects to an address that was previously disconnected from', () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    socketService.disconnect();
    socketService.connect('http://host:8080');
    expect(mockIo).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().connectionState).toBe('connecting');
  });

  it('on connect: reports connected and requests the session', () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    expect(useSessionStore.getState().connectionState).toBe('connected');
    expect(mockEmit).toHaveBeenCalledWith('get_session');
  });

  it('session_state replaces shots newest-first', () => {
    socketService.connect('http://host:8080');
    trigger('session_state', { shots: [makeShot('t1'), makeShot('t2')] });
    const shots = useSessionStore.getState().shots;
    expect(shots[0].timestamp).toBe('t2');
  });

  it('shot event prepends the new shot', () => {
    socketService.connect('http://host:8080');
    trigger('session_state', { shots: [makeShot('t1')] });
    trigger('shot', { shot: makeShot('t2', { shot_number: 2 }) });
    const shots = useSessionStore.getState().shots;
    expect(shots).toHaveLength(2);
    expect(shots[0].timestamp).toBe('t2');
  });

  it('disconnect event reports disconnected', () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    trigger('disconnect');
    expect(useSessionStore.getState().connectionState).toBe('disconnected');
  });

  it('connect_error reports error', () => {
    socketService.connect('http://host:8080');
    trigger('connect_error');
    expect(useSessionStore.getState().connectionState).toBe('error');
  });

  it('allows a retry after a failed connection', () => {
    // Regression: after a failed connect, Socket.IO leaves the socket assigned,
    // so a second connect() was swallowed by the "already connecting" guard and
    // the only recovery was reloading the whole app.
    socketService.connect('http://host:8080');
    trigger('connect_error');
    expect(useSessionStore.getState().connectionState).toBe('error');

    socketService.connect('http://host:8080');
    expect(mockIo).toHaveBeenCalledTimes(2); // a fresh attempt, not swallowed
    expect(mockClose).toHaveBeenCalledTimes(1); // the failed socket is torn down
    expect(useSessionStore.getState().connectionState).toBe('connecting');
  });

  it('starts a session once the connection is established', () => {
    // Shots are filed under a session, so one has to exist before any arrive.
    socketService.connect('http://host:8080');
    expect(useSessionStore.getState().sessionId).toBeNull();

    trigger('connect');

    expect(useSessionStore.getState().sessionId).toEqual(expect.any(String));
  });

  it('writes each arriving shot into history under the current session', async () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    const shot = makeShot('t1');

    trigger('shot', { shot });
    await flushPendingWrites();

    expect(mockSaveShot).toHaveBeenCalledTimes(1);
    expect(mockSaveShot).toHaveBeenCalledWith(useSessionStore.getState().sessionId, shot);
  });

  it('files the shot with the player the server attributed it to', async () => {
    // Two people sharing a bay produce one session; without the profile the
    // stored history cannot tell their shots apart.
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot', { shot: makeShot('t1', { profile_id: 'p1', profile_name: 'Alex' }) });
    await flushPendingWrites();

    expect(mockSaveShot).toHaveBeenCalledWith(
      useSessionStore.getState().sessionId,
      expect.objectContaining({ profile_id: 'p1', profile_name: 'Alex' }),
    );
  });

  it('still shows the shot when writing it to history fails', async () => {
    // A storage fault must cost history, never the shot the player just hit.
    mockSaveShot.mockRejectedValueOnce(new Error('disk full'));
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot', { shot: makeShot('t1') });
    await flushPendingWrites();

    expect(useSessionStore.getState().shots).toHaveLength(1);
  });

  it('simulateShot emits the simulate_shot event', () => {
    socketService.connect('http://host:8080');
    mockEmit.mockClear();
    socketService.simulateShot();
    expect(mockEmit).toHaveBeenCalledWith('simulate_shot');
  });

  it('disconnect() closes the socket and reports disconnected', () => {
    socketService.connect('http://host:8080');
    socketService.disconnect();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().connectionState).toBe('disconnected');
  });
});

describe('a shot the server enriches after publishing it', () => {
  it('shows one shot, with the final measurements, across the whole sequence', async () => {
    // The server publishes provisional OPS metrics as `shot`, then republishes
    // the same shot_number as `shot_update` once the slow hardware reports. The
    // player hit one ball and must see one row.
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot', { shot: makeShot('t1', { shot_number: 7, spin_rpm: null }) });
    trigger('shot_update', { shot: makeShot('t1', { shot_number: 7, spin_rpm: 2680 }) });
    await flushPendingWrites();

    const shots = useSessionStore.getState().shots;
    expect(shots).toHaveLength(1);
    expect(shots[0].spin_rpm).toBe(2680);
  });

  it('files the update against the same shot instead of adding a second one', async () => {
    // Both events go through the same keyed write, so history stores one row —
    // the repository decides insert-or-update from the shot_number it is given.
    socketService.connect('http://host:8080');
    trigger('connect');
    const sessionId = useSessionStore.getState().sessionId;

    trigger('shot', { shot: makeShot('t1', { shot_number: 7, spin_rpm: null }) });
    trigger('shot_update', { shot: makeShot('t1', { shot_number: 7, spin_rpm: 2680 }) });
    await flushPendingWrites();

    expect(mockSaveShot).toHaveBeenCalledTimes(2);
    for (const call of mockSaveShot.mock.calls) {
      expect(call[0]).toBe(sessionId);
      expect((call[1] as Shot).shot_number).toBe(7);
    }
    expect((mockSaveShot.mock.calls[1][1] as Shot).spin_rpm).toBe(2680);
  });

  it('handles the skipped-enrichment update, which carries the shot unchanged', async () => {
    // When the optional hardware cannot be admitted the server clears the
    // pending state by republishing the same shot immediately.
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot', { shot: makeShot('t1', { shot_number: 7 }) });
    trigger('shot_update', { shot: makeShot('t1', { shot_number: 7 }) });
    await flushPendingWrites();

    expect(useSessionStore.getState().shots).toHaveLength(1);
  });

  it('keeps an update for a shot that arrived before this phone connected', async () => {
    // Connecting mid-flight can deliver the update without its provisional
    // shot; dropping it would lose the swing entirely.
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot_update', { shot: makeShot('t1', { shot_number: 7 }) });
    await flushPendingWrites();

    expect(useSessionStore.getState().shots).toHaveLength(1);
    expect(mockSaveShot).toHaveBeenCalledTimes(1);
  });

  it('still shows the enriched shot when writing the update fails', async () => {
    mockSaveShot.mockRejectedValueOnce(new Error('disk full'));
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('shot_update', { shot: makeShot('t1', { shot_number: 7, spin_rpm: 2680 }) });
    await flushPendingWrites();

    expect(useSessionStore.getState().shots[0].spin_rpm).toBe(2680);
  });
});

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Alex',
    created_at: '2026-09-14T10:00:00Z',
    settings: {},
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ProfilesSnapshot> = {}): ProfilesSnapshot {
  return { profiles: [makeProfile()], active_profile_id: 'p1', ...overrides };
}

describe('the profile roster', () => {
  it('asks for the roster once connected', () => {
    // It does not ride along on session_state, so it has to be asked for.
    socketService.connect('http://host:8080');
    trigger('connect');

    expect(mockEmit).toHaveBeenCalledWith('get_profiles');
  });

  it('asks again after reconnecting', () => {
    // Profiles can be added or renamed on the kiosk while the phone is away.
    socketService.connect('http://host:8080');
    trigger('connect');
    trigger('disconnect');
    mockEmit.mockClear();

    trigger('connect');

    expect(mockEmit).toHaveBeenCalledWith('get_profiles');
  });

  it('mirrors the roster the server broadcast', () => {
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('profiles', {
      profiles: [makeProfile({ id: 'p1', name: 'Alex' }), makeProfile({ id: 'p2', name: 'Sam' })],
      active_profile_id: 'p2',
    });

    const state = useProfileStore.getState();
    expect(state.profiles.map((profile) => profile.name)).toEqual(['Alex', 'Sam']);
    expect(state.activeProfileId).toBe('p2');
    expect(state.loaded).toBe(true);
  });

  it('keeps the roster through a transient drop', () => {
    // Socket.IO reconnects on its own; blanking the picker on every wifi
    // hiccup would be worse than showing one the next snapshot replaces.
    socketService.connect('http://host:8080');
    trigger('connect');
    trigger('profiles', makeSnapshot());

    trigger('disconnect');

    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });

  it('forgets the roster when the user disconnects deliberately', () => {
    // A roster from the previous server must not linger as though current.
    socketService.connect('http://host:8080');
    trigger('connect');
    trigger('profiles', makeSnapshot());

    socketService.disconnect();

    const state = useProfileStore.getState();
    expect(state.profiles).toEqual([]);
    expect(state.loaded).toBe(false);
  });

  it('keeps the last good roster when a malformed snapshot arrives', () => {
    socketService.connect('http://host:8080');
    trigger('connect');
    trigger('profiles', makeSnapshot());

    trigger('profiles', { profiles: undefined });

    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });

  it('applies a repeated snapshot without accumulating the roster', () => {
    // The server rebroadcasts after every mutation, so the same roster arrives
    // repeatedly; each one replaces rather than appends.
    socketService.connect('http://host:8080');
    trigger('connect');

    trigger('profiles', makeSnapshot());
    trigger('profiles', makeSnapshot());

    expect(useProfileStore.getState().profiles).toHaveLength(1);
  });
});

describe('changing the roster', () => {
  beforeEach(() => {
    socketService.connect('http://host:8080');
    trigger('connect');
    mockEmit.mockClear();
  });

  it('selects a profile by id', () => {
    socketService.setActiveProfile('p2');
    expect(mockEmit).toHaveBeenCalledWith('set_active_profile', { profile_id: 'p2' });
  });

  it('adds a profile by name', () => {
    socketService.addProfile('Sam');
    expect(mockEmit).toHaveBeenCalledWith('add_profile', { name: 'Sam' });
  });

  it('renames a profile', () => {
    socketService.renameProfile('p1', 'Alexandra');
    expect(mockEmit).toHaveBeenCalledWith('rename_profile', {
      profile_id: 'p1',
      name: 'Alexandra',
    });
  });

  it('removes a profile', () => {
    socketService.removeProfile('p2');
    expect(mockEmit).toHaveBeenCalledWith('remove_profile', { profile_id: 'p2' });
  });

  it('sends nothing when there is no connection', () => {
    // A screen can still be mounted after a disconnect; emitting into a closed
    // socket would be silently lost, so nothing is sent at all.
    socketService.disconnect();
    mockEmit.mockClear();

    socketService.setActiveProfile('p2');

    expect(mockEmit).not.toHaveBeenCalled();
  });
});
