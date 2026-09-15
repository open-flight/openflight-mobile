import { create } from 'zustand';
import type { ConnectionState, Shot } from '../types';

// Single source of truth for connection + session state, shared across tabs.
// The socket service (services/socket.ts) is the only writer during normal
// operation; components read via selectors. Kept deliberately small and
// framework-agnostic so the transitions are unit-testable in isolation.

// One visit to the mat: a session spans a single connection, so reconnecting
// starts a new one. Shots are filed under it in on-device history, which is why
// two visits must never share an id.
let sessionCounter = 0;

interface SessionState {
  connectionState: ConnectionState;
  // Identifies the current visit; null until the first connection of this
  // launch. Kept after a disconnect so late-arriving writes still file
  // correctly.
  sessionId: string | null;
  // Shots are held newest-first (index 0 is the latest), which is the order
  // every screen wants. The server sends them oldest-first, so `setShots`
  // inverts on the way in.
  shots: Shot[];

  setConnectionState: (state: ConnectionState) => void;
  // Begin a new visit. Called once a connection is established, so every shot
  // that follows is filed under this id.
  startSession: () => void;
  // Replace the whole list from a `session_state` payload (server order:
  // oldest-first). Inverted here to preserve the newest-first invariant.
  setShots: (serverShots: Shot[]) => void;
  // Prepend a single shot from a `shot` event.
  addShot: (shot: Shot) => void;
  // Swap in the server's updated version of a shot already on the list, from a
  // `shot_update` event, matched on shot_number. An update for a shot this
  // client never saw — or one the server could not number — is prepended
  // instead, so an enriched shot is never silently dropped.
  replaceShot: (shot: Shot) => void;
  clearShots: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  connectionState: 'disconnected',
  sessionId: null,
  shots: [],

  setConnectionState: (state) => set({ connectionState: state }),
  // Date.now() alone collides when two connections land within the same
  // millisecond, so a counter keeps consecutive visits distinct.
  startSession: () => set({ sessionId: `${Date.now()}-${++sessionCounter}` }),
  setShots: (serverShots) => set({ shots: [...serverShots].reverse() }),
  addShot: (shot) => set((prev) => ({ shots: [shot, ...prev.shots] })),
  replaceShot: (shot) =>
    set((prev) => {
      // Normalised because swing-speed payloads omit shot_number rather than
      // sending null; undefined is not === null and slipped past this guard,
      // matching every other unnumbered shot on the list.
      const shotNumber = shot.shot_number ?? null;
      const index =
        shotNumber === null
          ? -1
          : prev.shots.findIndex((existing) => existing.shot_number === shotNumber);
      if (index === -1) return { shots: [shot, ...prev.shots] };
      const shots = [...prev.shots];
      shots[index] = shot;
      return { shots };
    }),
  clearShots: () => set({ shots: [] }),
}));
