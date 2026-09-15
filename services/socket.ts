import { io, type Socket } from 'socket.io-client';
import { useSessionStore } from '../stores/useSessionStore';
import { useProfileStore } from '../stores/useProfileStore';
import { saveServerUrl } from '../storage/connection';
import { getShotRepository } from '../storage/db';
import type { ProfilesSnapshot, SessionStatePayload, Shot, ShotEnvelope } from '../types';

// Singleton Socket.IO client, mirroring the web app's socketService shape: one
// place that maps every server event onto a store mutation. Kept out of the
// React tree so a reconnect or a background disconnect doesn't depend on any
// screen being mounted.
//
// Reconnection is handled by Socket.IO itself (exponential backoff, enabled by
// default); the handlers here just reflect the resulting connection state and
// re-sync the session on every (re)connect.
class SocketService {
  private socket: Socket | null = null;
  // Address the current socket was opened against. The connect guard keys on
  // this as well as connection state, so changing the address can replace an
  // in-flight attempt instead of being swallowed by it.
  private url: string | null = null;

  connect(url: string): void {
    const store = useSessionStore.getState();

    // A live or in-flight attempt to this same address already exists — ignore,
    // so we don't thrash a healthy connection or stack duplicate attempts. A
    // different address means the user corrected the server, so the outstanding
    // attempt is abandoned in favour of the new one rather than ignored.
    const state = store.connectionState;
    if (this.socket && this.url === url && (state === 'connecting' || state === 'connected')) {
      return;
    }

    // Otherwise a socket may still be assigned — either from a failed attempt
    // (Socket.IO leaves it in place on connect_error) or from an attempt being
    // replaced above. Tear it down so the new attempt starts fresh; without
    // this, a second Connect tap was swallowed and the only recovery was
    // reloading the app.
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    store.setConnectionState('connecting');
    this.url = url;

    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;
    this.registerHandlers(socket, url);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.url = null;
    useSessionStore.getState().setConnectionState('disconnected');
    // Only the deliberate disconnect clears the roster. A transient drop is
    // handled by the 'disconnect' event below, which leaves it in place —
    // blanking the picker every time the wifi hiccups would be worse than
    // showing a roster the next snapshot replaces.
    useProfileStore.getState().reset();
  }

  simulateShot(): void {
    this.socket?.emit('simulate_shot');
  }

  // --- Profiles ---
  // Every mutation is fire-and-forget: the server answers each one with a full
  // `profiles` snapshot, including when it refuses (it will not remove the
  // active profile, one with shots, or the last one). There is nothing to
  // update optimistically and nothing to roll back — the reply is the truth.

  setActiveProfile(profileId: string): void {
    this.socket?.emit('set_active_profile', { profile_id: profileId });
  }

  addProfile(name: string): void {
    this.socket?.emit('add_profile', { name });
  }

  renameProfile(profileId: string, name: string): void {
    this.socket?.emit('rename_profile', { profile_id: profileId, name });
  }

  removeProfile(profileId: string): void {
    this.socket?.emit('remove_profile', { profile_id: profileId });
  }

  // Files one shot under the current visit. Callers fire and forget, so this
  // absorbs every failure itself rather than leaving a rejected promise loose.
  private async persistShot(shot: Shot): Promise<void> {
    try {
      const { sessionId } = useSessionStore.getState();
      // Shots only arrive over an established connection, which is what starts
      // a session; without one there is nothing to file this under.
      if (sessionId === null) return;

      const repository = await getShotRepository();
      await repository.saveShot(sessionId, shot);
    } catch {
      // History loses a shot; the live view already has it.
    }
  }

  private registerHandlers(socket: Socket, url: string): void {
    const store = useSessionStore.getState;

    socket.on('connect', () => {
      store().setConnectionState('connected');
      // A session is one connection span, so every reconnect files the shots
      // that follow under a fresh visit in on-device history.
      store().startSession();
      // Remember a URL only once it actually connects, so we never persist a
      // typo'd address that never worked.
      void saveServerUrl(url);
      // Re-sync the full session on every (re)connect, not just the first.
      socket.emit('get_session');
      // The roster is not part of session_state, so it is asked for
      // separately — and on every reconnect, since it may have changed on
      // another client while this phone was away.
      socket.emit('get_profiles');
    });

    socket.on('disconnect', () => {
      // A transient drop: Socket.IO will attempt to reconnect in the
      // background. Surface it as disconnected until 'connect' fires again.
      store().setConnectionState('disconnected');
    });

    socket.on('connect_error', () => {
      store().setConnectionState('error');
    });

    socket.on('session_state', (data: SessionStatePayload) => {
      store().setShots(data.shots);
    });

    socket.on('shot', (data: ShotEnvelope) => {
      store().addShot(data.shot);
      // Deliberately not awaited: the tile on screen must never wait on a disk
      // write. The repository swallows its own failures, so history is what is
      // lost when storage misbehaves, not the shot.
      void this.persistShot(data.shot);
    });

    // When optional hardware can add seconds to a shot, the server publishes
    // provisional metrics as `shot` and then re-publishes the same shot — same
    // shot_number — as `shot_update`, either enriched or marked skipped. Both
    // the live list and history therefore update that shot rather than gaining
    // a second copy of it.
    socket.on('shot_update', (data: ShotEnvelope) => {
      store().replaceShot(data.shot);
      void this.persistShot(data.shot);
    });

    // The server's authoritative roster, broadcast after every mutation — and
    // after one it refuses, which is how a client that asked for something
    // invalid (removing the active profile, the last profile, or one with
    // shots) discovers nothing changed. Applying it verbatim is the whole
    // reconciliation strategy; there is no local copy to merge.
    socket.on('profiles', (data: ProfilesSnapshot) => {
      useProfileStore.getState().applySnapshot(data);
    });
  }
}

export const socketService = new SocketService();
