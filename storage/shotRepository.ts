import type { Shot, SpinQuality } from '../types';

// On-device shot history. Mirrors the failure policy of storage/connection.ts:
// every call is async and never throws, because a storage fault must not break
// the live shot pipeline — a lost write costs history, a thrown error costs the
// shot on screen.

// The slice of a SQLite database this module needs. expo-sqlite supplies it on
// the device (see storage/db.ts); tests back it with node:sqlite so the schema
// and queries genuinely run instead of being mocked.
export interface ShotDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T>(source: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: unknown[]): Promise<T | null>;
}

export interface SessionSummary {
  sessionId: string;
  shotCount: number;
  firstShotAt: string;
  lastShotAt: string;
}

export interface ShotRepository {
  init(): Promise<void>;
  saveShot(sessionId: string, shot: Shot): Promise<void>;
  loadShots(sessionId: string, filter?: { profileId?: string }): Promise<Shot[]>;
  loadSessions(): Promise<SessionSummary[]>;
  clearAll(): Promise<void>;
}

// Bump alongside a new entry in MIGRATIONS; init() applies only what is missing,
// so an existing database is upgraded rather than recreated.
const SCHEMA_VERSION = 2;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS shots (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id TEXT NOT NULL,
     timestamp TEXT NOT NULL,
     club TEXT NOT NULL,
     mode TEXT,
     profile_id TEXT,
     profile_name TEXT,
     ball_speed_mph REAL NOT NULL,
     club_speed_mph REAL,
     smash_factor REAL,
     estimated_carry_yards REAL NOT NULL,
     carry_spin_adjusted REAL,
     carry_range_low REAL NOT NULL,
     carry_range_high REAL NOT NULL,
     launch_angle_vertical REAL,
     launch_angle_horizontal REAL,
     launch_angle_confidence REAL,
     angle_source TEXT,
     club_angle_deg REAL,
     club_path_deg REAL,
     spin_axis_deg REAL,
     spin_rpm REAL,
     spin_source TEXT,
     spin_quality TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(session_id, timestamp DESC);
   CREATE INDEX IF NOT EXISTS idx_shots_club ON shots(club);`,
  // v2: the server's shot identity, so an enriched re-emit of a shot already
  // stored updates that row instead of landing beside it.
  `ALTER TABLE shots ADD COLUMN shot_number INTEGER;
   CREATE INDEX IF NOT EXISTS idx_shots_session_number ON shots(session_id, shot_number);`,
];

// Row shape as stored. carry_range is a tuple in the wire contract, so it is
// flattened into two columns here and reassembled on read.
interface ShotRow {
  shot_number: number | null;
  timestamp: string;
  club: string;
  mode: string | null;
  profile_id: string | null;
  profile_name: string | null;
  ball_speed_mph: number;
  club_speed_mph: number | null;
  smash_factor: number | null;
  estimated_carry_yards: number;
  carry_spin_adjusted: number | null;
  carry_range_low: number;
  carry_range_high: number;
  launch_angle_vertical: number | null;
  launch_angle_horizontal: number | null;
  launch_angle_confidence: number | null;
  angle_source: string | null;
  club_angle_deg: number | null;
  club_path_deg: number | null;
  spin_axis_deg: number | null;
  spin_rpm: number | null;
  spin_source: string | null;
  spin_quality: string | null;
}

function rowToShot(row: ShotRow): Shot {
  return {
    // Absent in storage means absent on the wire, not a mode of its own.
    ...(row.mode === null ? {} : { mode: row.mode as Shot['mode'] }),
    shot_number: row.shot_number,
    ball_speed_mph: row.ball_speed_mph,
    club_speed_mph: row.club_speed_mph,
    smash_factor: row.smash_factor,
    estimated_carry_yards: row.estimated_carry_yards,
    carry_spin_adjusted: row.carry_spin_adjusted,
    carry_range: [row.carry_range_low, row.carry_range_high],
    club: row.club,
    profile_id: row.profile_id,
    profile_name: row.profile_name,
    timestamp: row.timestamp,
    launch_angle_vertical: row.launch_angle_vertical,
    launch_angle_horizontal: row.launch_angle_horizontal,
    launch_angle_confidence: row.launch_angle_confidence,
    angle_source: row.angle_source,
    club_angle_deg: row.club_angle_deg,
    club_path_deg: row.club_path_deg,
    spin_axis_deg: row.spin_axis_deg,
    spin_rpm: row.spin_rpm,
    spin_source: row.spin_source as Shot['spin_source'],
    spin_quality: row.spin_quality as SpinQuality | null,
  };
}

// The server leaves an unset profile as an empty string rather than null;
// storing that verbatim would make "" look like a profile you could filter on.
function orNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

// One column order shared by the insert and the update, so the two cannot drift
// apart as fields are added.
const MEASUREMENT_COLUMNS = [
  'timestamp',
  'club',
  'mode',
  'profile_id',
  'profile_name',
  'ball_speed_mph',
  'club_speed_mph',
  'smash_factor',
  'estimated_carry_yards',
  'carry_spin_adjusted',
  'carry_range_low',
  'carry_range_high',
  'launch_angle_vertical',
  'launch_angle_horizontal',
  'launch_angle_confidence',
  'angle_source',
  'club_angle_deg',
  'club_path_deg',
  'spin_axis_deg',
  'spin_rpm',
  'spin_source',
  'spin_quality',
] as const;

function measurementValues(shot: Shot): unknown[] {
  return [
    shot.timestamp,
    shot.club,
    shot.mode ?? null,
    orNull(shot.profile_id),
    orNull(shot.profile_name),
    shot.ball_speed_mph,
    shot.club_speed_mph,
    shot.smash_factor,
    shot.estimated_carry_yards,
    shot.carry_spin_adjusted,
    shot.carry_range[0],
    shot.carry_range[1],
    shot.launch_angle_vertical,
    shot.launch_angle_horizontal,
    shot.launch_angle_confidence,
    shot.angle_source,
    shot.club_angle_deg,
    shot.club_path_deg,
    shot.spin_axis_deg,
    shot.spin_rpm,
    shot.spin_source,
    shot.spin_quality,
  ];
}

export function createShotRepository(db: ShotDatabase): ShotRepository {
  return {
    async init() {
      try {
        const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
        const current = row?.user_version ?? 0;
        if (current >= SCHEMA_VERSION) return;

        for (const migration of MIGRATIONS.slice(current)) {
          await db.execAsync(migration);
        }
        // PRAGMA does not accept bound parameters; SCHEMA_VERSION is a literal.
        await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      } catch {
        // Leave the app usable without history rather than failing to start.
      }
    },

    // The single write path for both `shot` and `shot_update`. The server
    // re-emits an enriched shot under the same shot_number, so a shot already
    // filed is updated in place. A shot the server could not number is
    // appended, which cannot collide with anything.
    //
    // shot_number is normalised before use: swing-speed mode omits the key
    // from its payload entirely rather than sending null
    // (swing_speed_to_shot_dict, server.py:4322-4374). The absent key arrives
    // as undefined, which is not === null, so it slipped past the guard below
    // and reached a bound SQL parameter — throwing, and being swallowed by the
    // catch, which discarded every shot of the session.
    async saveShot(sessionId, shot) {
      try {
        const shotNumber = shot.shot_number ?? null;
        const existing =
          shotNumber === null
            ? null
            : await db.getFirstAsync<{ id: number }>(
                'SELECT id FROM shots WHERE session_id = ? AND shot_number = ?',
                [sessionId, shotNumber],
              );

        if (existing) {
          await db.runAsync(
            `UPDATE shots SET ${MEASUREMENT_COLUMNS.map((column) => `${column} = ?`).join(', ')}
             WHERE id = ?`,
            [...measurementValues(shot), existing.id],
          );
          return;
        }

        const columns = ['session_id', 'shot_number', ...MEASUREMENT_COLUMNS];
        await db.runAsync(
          `INSERT INTO shots (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          [sessionId, shotNumber, ...measurementValues(shot)],
        );
      } catch {
        // A dropped write loses one shot from history; the live view is unaffected.
      }
    },

    async loadShots(sessionId, filter) {
      try {
        // id breaks ties so shots recorded within the same second keep their order.
        const rows = filter?.profileId
          ? await db.getAllAsync<ShotRow>(
              `SELECT * FROM shots WHERE session_id = ? AND profile_id = ?
               ORDER BY timestamp DESC, id DESC`,
              [sessionId, filter.profileId],
            )
          : await db.getAllAsync<ShotRow>(
              `SELECT * FROM shots WHERE session_id = ? ORDER BY timestamp DESC, id DESC`,
              [sessionId],
            );
        return rows.map(rowToShot);
      } catch {
        return [];
      }
    },

    async loadSessions() {
      try {
        return await db.getAllAsync<SessionSummary>(
          `SELECT session_id AS sessionId,
                  COUNT(*) AS shotCount,
                  MIN(timestamp) AS firstShotAt,
                  MAX(timestamp) AS lastShotAt
           FROM shots
           GROUP BY session_id
           ORDER BY lastShotAt DESC`,
        );
      } catch {
        return [];
      }
    },

    async clearAll() {
      try {
        await db.execAsync('DELETE FROM shots');
      } catch {
        // Nothing to report: the caller asked for empty, and empty is what it reads as.
      }
    },
  };
}
