import { useProfileStore } from '../stores/useProfileStore';
import type { Profile, ProfilesSnapshot } from '../types';

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
  return {
    profiles: [makeProfile()],
    active_profile_id: 'p1',
    ...overrides,
  };
}

// The store is a module singleton; reset it so one test's roster cannot leak
// into the next.
beforeEach(() => {
  useProfileStore.getState().reset();
});

describe('useProfileStore', () => {
  it('starts empty and not yet loaded', () => {
    const state = useProfileStore.getState();
    expect(state.profiles).toEqual([]);
    expect(state.activeProfileId).toBe('');
    // A screen needs to tell "not asked yet" apart from "no profiles exist".
    expect(state.loaded).toBe(false);
  });

  it('mirrors the roster and selection the server sent', () => {
    useProfileStore.getState().applySnapshot(
      makeSnapshot({
        profiles: [makeProfile({ id: 'p1', name: 'Alex' }), makeProfile({ id: 'p2', name: 'Sam' })],
        active_profile_id: 'p2',
      }),
    );

    const state = useProfileStore.getState();
    expect(state.profiles.map((profile) => profile.name)).toEqual(['Alex', 'Sam']);
    expect(state.activeProfileId).toBe('p2');
    expect(state.loaded).toBe(true);
  });

  it('replaces the roster wholesale rather than merging into it', () => {
    // The server sends its complete roster every time, so a profile removed on
    // the kiosk has to disappear here too.
    useProfileStore
      .getState()
      .applySnapshot(
        makeSnapshot({ profiles: [makeProfile({ id: 'p1' }), makeProfile({ id: 'p2' })] }),
      );

    useProfileStore
      .getState()
      .applySnapshot(
        makeSnapshot({ profiles: [makeProfile({ id: 'p1' })], active_profile_id: 'p1' }),
      );

    expect(useProfileStore.getState().profiles.map((profile) => profile.id)).toEqual(['p1']);
  });

  it('keeps the last good roster when a malformed snapshot arrives', () => {
    // Blanking the picker mid-session would be worse than showing a stale
    // roster that the next valid snapshot corrects.
    useProfileStore.getState().applySnapshot(makeSnapshot());

    useProfileStore
      .getState()
      .applySnapshot({ profiles: undefined } as unknown as ProfilesSnapshot);

    const state = useProfileStore.getState();
    expect(state.profiles).toHaveLength(1);
    expect(state.loaded).toBe(true);
  });

  it('treats a missing active_profile_id as no selection', () => {
    useProfileStore
      .getState()
      .applySnapshot({ profiles: [makeProfile()] } as unknown as ProfilesSnapshot);

    expect(useProfileStore.getState().activeProfileId).toBe('');
    expect(useProfileStore.getState().loaded).toBe(true);
  });

  it('accepts an empty roster as a real answer, not a failure', () => {
    useProfileStore.getState().applySnapshot(makeSnapshot({ profiles: [], active_profile_id: '' }));

    const state = useProfileStore.getState();
    expect(state.profiles).toEqual([]);
    expect(state.loaded).toBe(true);
  });

  it('round-trips the open settings dict untouched', () => {
    // The server persists `settings` without interpreting it, and later
    // features claim keys there; the client must not reshape it.
    const settings = { bag: ['driver', '7-iron'], nested: { anything: 1 } };

    useProfileStore
      .getState()
      .applySnapshot(makeSnapshot({ profiles: [makeProfile({ settings })] }));

    expect(useProfileStore.getState().profiles[0].settings).toEqual(settings);
  });

  it('forgets the roster on reset so a stale one cannot look current', () => {
    useProfileStore.getState().applySnapshot(makeSnapshot());

    useProfileStore.getState().reset();

    const state = useProfileStore.getState();
    expect(state.profiles).toEqual([]);
    expect(state.activeProfileId).toBe('');
    expect(state.loaded).toBe(false);
  });
});
