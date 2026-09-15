// Local mirror of the subset of src/openflight/server.py's shot_to_dict() payload
// that the mobile UI renders. Intentionally self-contained rather than shared
// with ui/src/types/shot.ts -- the two apps ship separately, and both are just
// hand-mirrors of the Python wire contract (the real source of truth).

export type SpinQuality = 'high' | 'medium' | 'low' | 'experimental';

// Graded confidence used for the 3-dot indicator on launch-angle tiles.
export type AngleQuality = 'high' | 'medium' | 'low';

export interface Shot {
  mode?: 'rolling-buffer' | 'mock' | 'swing-speed';
  // The server's identity for a shot, assigned before any async work and never
  // reassigned. A shot can reach the client twice -- provisionally as `shot`,
  // then again as `shot_update` once enrichment finishes -- and this is what
  // ties the two together.
  shot_number: number | null;
  ball_speed_mph: number;
  club_speed_mph: number | null;
  smash_factor: number | null;
  estimated_carry_yards: number;
  carry_spin_adjusted: number | null;
  carry_range: [number, number];
  club: string;
  // The profile that was active when the shot was struck. Two people sharing a
  // bay produce one session, so this is what keeps their histories apart.
  profile_id: string | null;
  profile_name: string | null;
  timestamp: string;
  // Launch angle data (radar/camera/estimation; "mock" in mock mode)
  launch_angle_vertical: number | null;
  launch_angle_horizontal: number | null;
  launch_angle_confidence: number | null;
  angle_source: string | null;
  club_angle_deg: number | null;
  club_path_deg: number | null;
  spin_axis_deg: number | null;
  // Rolling buffer mode spin data
  spin_rpm: number | null;
  spin_source: 'measured' | 'calculated' | null;
  spin_quality: SpinQuality | null;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// --- Wire-contract payloads (mirror src/openflight/server.py SocketIO events) ---
// These document the events later roadmap phases consume. Phase 0 wires only
// `session_state` and `shot`; the rest are declared here so adding a feature is
// a store/handler change, not a type-hunting exercise.

// `shot` event payload. The web UI also receives `stats` alongside the shot;
// mobile derives its own stats from the shot list, so only `shot` is modelled.
//
// `shot_update` carries the same envelope: the server re-emits a shot it has
// already sent, under the same shot_number, once optional hardware enrichment
// finishes or is skipped. Its extra `stats`, `pending` and `enrichment` keys
// are not modelled because mobile does not read them.
export interface ShotEnvelope {
  shot: Shot;
}

// `session_state` event payload (emitted after `get_session`). The server sends
// shots oldest-first; the store inverts this to its newest-first invariant.
export interface SessionStatePayload {
  shots: Shot[];
  mock_mode?: boolean;
  debug_mode?: boolean;
  player_name?: string;
}

// `shot_processing` event: the capture/analysis lifecycle for the live view.
export type ShotProcessingState = 'capturing' | 'calculating' | 'failed';

// `club_changed`: a server-pushed selection change, reflected back into the
// local picker without echoing to the server.
export interface ClubChangedPayload {
  club: string;
}

// --- Profiles (mirrors src/openflight/profiles.py) ---
// A profile is one named context shots are attributed to — a person, or a
// place. There is deliberately no separate "player" concept: the server has no
// set_player or player_changed event, and profiles are what player selection
// actually needs.

export interface Profile {
  id: string;
  name: string;
  // ISO-8601 UTC, seconds precision, Z-suffixed.
  created_at: string;
  // An open dict the server persists and round-trips without interpreting it;
  // later features claim keys here. Left unshaped on purpose — narrowing it
  // client-side would silently drop keys written by another client.
  settings: Record<string, unknown>;
}

// The `profiles` event: the server's authoritative roster and selection, sent
// as one snapshot after every mutation — including a mutation it refuses, so a
// client that asked for something invalid self-heals from the reply.
export interface ProfilesSnapshot {
  profiles: Profile[];
  // Empty string when nothing is selected yet.
  active_profile_id: string;
}
