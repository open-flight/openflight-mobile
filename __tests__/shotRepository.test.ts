import { createShotRepository, type ShotDatabase } from '../storage/shotRepository';
import type { Shot } from '../types';

// node:sqlite ships with the Node version this project pins, but an Expo app
// carries no Node type definitions, and adding @types/node would change global
// typings for the whole app (setTimeout's return type, among others). Requiring
// it against a local type keeps that blast radius inside this test.
interface TestStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface TestDatabase {
  exec(source: string): void;
  prepare(source: string): TestStatement;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => TestDatabase;
};

// The repository is tested against a real SQLite database (node:sqlite, built
// into the Node version this project pins) rather than a mock, so the schema,
// the migration and every query actually run. On the device `expo-sqlite`
// supplies the same four methods; the adapter below is the only difference.
function openTestDatabase(): ShotDatabase {
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (source: string) => {
      db.exec(source);
    },
    runAsync: async (source: string, params: unknown[] = []) => {
      db.prepare(source).run(...(params as never[]));
    },
    getAllAsync: async <T>(source: string, params: unknown[] = []) =>
      db.prepare(source).all(...(params as never[])) as T[],
    getFirstAsync: async <T>(source: string, params: unknown[] = []) =>
      (db.prepare(source).get(...(params as never[])) as T) ?? null,
  };
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    mode: 'rolling-buffer',
    shot_number: 1,
    ball_speed_mph: 148.2,
    club_speed_mph: 104.1,
    smash_factor: 1.42,
    estimated_carry_yards: 266,
    carry_spin_adjusted: 271,
    carry_range: [258, 274],
    club: 'driver',
    profile_id: null,
    profile_name: null,
    timestamp: '2026-09-14T10:00:00Z',
    launch_angle_vertical: 12.4,
    launch_angle_horizontal: -1.2,
    launch_angle_confidence: 0.8,
    angle_source: 'radar',
    club_angle_deg: -3.1,
    club_path_deg: 1.4,
    spin_axis_deg: -5.2,
    spin_rpm: 2680,
    spin_source: 'measured',
    spin_quality: 'medium',
    ...overrides,
  };
}

describe('shotRepository', () => {
  it('reads back a shot exactly as it was recorded', async () => {
    const repo = createShotRepository(openTestDatabase());
    await repo.init();
    const shot = makeShot();

    await repo.saveShot('session-1', shot);

    expect(await repo.loadShots('session-1')).toEqual([shot]);
  });

  it('keeps a missing measurement null instead of turning it into zero', async () => {
    // Optional metrics are genuinely absent on some shots; a 0 mph club speed
    // would read as a real measurement on screen.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot(
      'session-1',
      makeShot({ club_speed_mph: null, smash_factor: null, spin_rpm: null, spin_quality: null }),
    );

    const [stored] = await repo.loadShots('session-1');
    expect(stored.club_speed_mph).toBeNull();
    expect(stored.smash_factor).toBeNull();
    expect(stored.spin_rpm).toBeNull();
    expect(stored.spin_quality).toBeNull();
  });

  it('returns a session newest-first, the order every screen wants', async () => {
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 1, timestamp: '2026-09-14T10:00:00Z' }),
    );
    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 2, timestamp: '2026-09-14T10:05:00Z' }),
    );
    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 3, timestamp: '2026-09-14T10:02:00Z' }),
    );

    const stored = await repo.loadShots('session-1');
    expect(stored.map((s) => s.timestamp)).toEqual([
      '2026-09-14T10:05:00Z',
      '2026-09-14T10:02:00Z',
      '2026-09-14T10:00:00Z',
    ]);
  });

  it("keeps one player's shots out of another's history", async () => {
    // The server stamps every shot with the profile it belongs to; dropping
    // that would blend two players' sessions together.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 1, profile_id: 'p1', profile_name: 'Alex' }),
    );
    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 2, profile_id: 'p2', profile_name: 'Sam' }),
    );

    const sessions = await repo.loadSessions();
    expect(sessions[0].shotCount).toBe(2);
    expect(await repo.loadShots('session-1', { profileId: 'p1' })).toHaveLength(1);
  });

  it('stores the player the server attributed the shot to', async () => {
    // Attribution has to survive the round trip, or a shared session reads back
    // as though nobody hit any of it.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('session-1', makeShot({ profile_id: 'p1', profile_name: 'Alex' }));

    const [stored] = await repo.loadShots('session-1');
    expect(stored.profile_id).toBe('p1');
    expect(stored.profile_name).toBe('Alex');
  });

  it('treats an unset profile as absent rather than as a player with no name', async () => {
    // The server leaves an unset profile as an empty string; stored verbatim it
    // would become a profile you could filter on.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('session-1', makeShot({ profile_id: '', profile_name: '' }));

    const [stored] = await repo.loadShots('session-1');
    expect(stored.profile_id).toBeNull();
    expect(stored.profile_name).toBeNull();
  });

  it('lists past sessions newest-first with their shot counts', async () => {
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('older', makeShot({ shot_number: 1, timestamp: '2026-09-13T09:00:00Z' }));
    await repo.saveShot('newer', makeShot({ shot_number: 1, timestamp: '2026-09-14T09:00:00Z' }));
    await repo.saveShot('newer', makeShot({ shot_number: 2, timestamp: '2026-09-14T09:30:00Z' }));

    const sessions = await repo.loadSessions();
    expect(sessions.map((s) => s.sessionId)).toEqual(['newer', 'older']);
    expect(sessions[0].shotCount).toBe(2);
    expect(sessions[0].lastShotAt).toBe('2026-09-14T09:30:00Z');
  });

  // Swing-speed mode reuses the `shot` event but serializes a different key
  // set: swing_speed_to_shot_dict() omits shot_number entirely rather than
  // sending it as null (server.py:4322-4374). An absent key deserializes to
  // undefined, which is not === null, so the identity guard below takes the
  // wrong branch and undefined reaches the bound SQL parameter. The factory
  // above always supplies shot_number, so no existing test reaches this path.
  describe('a shot the server could not number', () => {
    function makeUnnumberedShot(overrides: Partial<Shot> = {}): Shot {
      const shot = makeShot(overrides);
      delete (shot as Partial<Shot>).shot_number;
      return shot;
    }

    it('records every swing of a swing-speed session', async () => {
      // The whole session was being lost, not one shot: undefined reached a
      // bound parameter, threw, and saveShot's catch swallowed it. Nothing
      // surfaced, because the live view never reads back from storage.
      const repo = createShotRepository(openTestDatabase());
      await repo.init();

      await repo.saveShot('session-1', makeUnnumberedShot({ timestamp: '2026-09-14T10:00:00Z' }));
      await repo.saveShot('session-1', makeUnnumberedShot({ timestamp: '2026-09-14T10:01:00Z' }));

      expect(await repo.loadShots('session-1')).toHaveLength(2);
    });

    it('stores an absent shot number as null, the same as an explicit one', async () => {
      // Normalising on the way in keeps one representation in the database, so
      // a reloaded shot is indistinguishable from one the server sent as null.
      const repo = createShotRepository(openTestDatabase());
      await repo.init();

      await repo.saveShot('session-1', makeUnnumberedShot({ timestamp: '2026-09-14T10:00:00Z' }));

      const [stored] = await repo.loadShots('session-1');
      expect(stored.shot_number).toBeNull();
    });
  });

  it('can be initialised twice without losing what is already stored', async () => {
    // init() runs on every launch; a migration that re-ran destructively would
    // wipe the player's history.
    const db = openTestDatabase();
    const repo = createShotRepository(db);
    await repo.init();
    await repo.saveShot('session-1', makeShot());

    await createShotRepository(db).init();

    expect(await repo.loadShots('session-1')).toHaveLength(1);
  });

  it('degrades to an empty history when the database is unavailable', async () => {
    // A storage fault must never take the app down or stall the live shot
    // pipeline, so every call swallows the failure and returns a safe value.
    const broken: ShotDatabase = {
      execAsync: async () => {
        throw new Error('disk I/O error');
      },
      runAsync: async () => {
        throw new Error('disk I/O error');
      },
      getAllAsync: async () => {
        throw new Error('disk I/O error');
      },
      getFirstAsync: async () => {
        throw new Error('disk I/O error');
      },
    };
    const repo = createShotRepository(broken);

    await expect(repo.init()).resolves.toBeUndefined();
    await expect(repo.saveShot('session-1', makeShot())).resolves.toBeUndefined();
    await expect(repo.loadShots('session-1')).resolves.toEqual([]);
    await expect(repo.loadSessions()).resolves.toEqual([]);
  });
});

describe('a shot the server publishes twice', () => {
  it('files the enriched version over the provisional one, not beside it', async () => {
    // When optional hardware is slow the server emits provisional metrics as
    // `shot` and republishes the same shot_number as `shot_update`. Storing
    // both would double every shot in history and skew the session averages.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 7, spin_rpm: null, launch_angle_vertical: null }),
    );
    await repo.saveShot(
      'session-1',
      makeShot({ shot_number: 7, spin_rpm: 2680, launch_angle_vertical: 12.4 }),
    );

    const stored = await repo.loadShots('session-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].spin_rpm).toBe(2680);
    expect(stored[0].launch_angle_vertical).toBe(12.4);
  });

  it('counts that shot once in the session summary', async () => {
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('session-1', makeShot({ shot_number: 7 }));
    await repo.saveShot('session-1', makeShot({ shot_number: 7 }));

    const [session] = await repo.loadSessions();
    expect(session.shotCount).toBe(1);
  });

  it('keeps the same shot number in two different visits apart', async () => {
    // Numbering restarts per server run, so shot #1 of today's visit must not
    // overwrite shot #1 of last week's.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('session-1', makeShot({ shot_number: 1, club: 'driver' }));
    await repo.saveShot('session-2', makeShot({ shot_number: 1, club: '7 iron' }));

    expect(await repo.loadShots('session-1')).toHaveLength(1);
    expect(await repo.loadShots('session-2')).toHaveLength(1);
  });

  it('appends a shot the server could not number instead of merging it', async () => {
    // shot_number is nullable on the wire; two unnumbered shots are not the
    // same shot, so they must not collapse into one row.
    const repo = createShotRepository(openTestDatabase());
    await repo.init();

    await repo.saveShot('session-1', makeShot({ shot_number: null, club: 'driver' }));
    await repo.saveShot('session-1', makeShot({ shot_number: null, club: '7 iron' }));

    expect(await repo.loadShots('session-1')).toHaveLength(2);
  });

  it('upgrades a v1 database without dropping the shots already in it', async () => {
    // Anyone who installed the first version of history has a v1 file on disk;
    // the shot_number column has to arrive by migration, not by recreation.
    const db = openTestDatabase();
    await db.execAsync(`CREATE TABLE shots (
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
     );`);
    await db.runAsync(
      `INSERT INTO shots (session_id, timestamp, club, ball_speed_mph,
         estimated_carry_yards, carry_range_low, carry_range_high)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['session-1', '2026-09-01T10:00:00Z', 'driver', 140, 250, 240, 260],
    );
    await db.execAsync('PRAGMA user_version = 1');

    const repo = createShotRepository(db);
    await repo.init();

    const stored = await repo.loadShots('session-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].shot_number).toBeNull();

    // And the upgraded database still takes new shots.
    await repo.saveShot('session-1', makeShot({ shot_number: 2 }));
    expect(await repo.loadShots('session-1')).toHaveLength(2);
  });
});
