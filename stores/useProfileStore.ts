import { create } from 'zustand';
import type { Profile, ProfilesSnapshot } from '../types';

// A mirror of the server's roster, not a source of truth.
//
// The server owns profiles.json and broadcasts one authoritative `profiles`
// snapshot after every mutation — including mutations it refuses — so there is
// nothing to reconcile here and nothing to persist. Deliberately no
// AsyncStorage: the web UI found that a second copy of the selection raced the
// snapshot that arrives on connect, and a phone reconnects far more often than
// a kiosk does.

interface ProfileState {
  profiles: Profile[];
  // The server's chosen profile. Empty string until the first snapshot lands,
  // matching the server's own "no selection yet" representation.
  activeProfileId: string;
  // False until the first snapshot arrives, so a screen can tell "no profiles"
  // apart from "not asked yet" and show a skeleton rather than an empty state.
  loaded: boolean;

  applySnapshot: (snapshot: ProfilesSnapshot) => void;
  // Drop back to the pre-connection state. A roster from the previous server
  // must not linger as though it were current.
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  activeProfileId: '',
  loaded: false,

  applySnapshot: (snapshot) => {
    // A malformed payload leaves the last good roster in place rather than
    // blanking the picker mid-session.
    if (!snapshot || !Array.isArray(snapshot.profiles)) return;
    set({
      profiles: snapshot.profiles,
      activeProfileId: snapshot.active_profile_id ?? '',
      loaded: true,
    });
  },

  reset: () => set({ profiles: [], activeProfileId: '', loaded: false }),
}));
