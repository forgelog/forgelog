import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';
import { backfillPersonalRecordState } from './personalRecordState';
import { backfillSecondaryMuscles, seedExercises } from './seed';

const DB_NAME = 'forgelog.db';

// Bump this and add an `if (currentVersion < N)` branch below whenever the
// schema changes, so existing installs migrate instead of losing data.
const LATEST_SCHEMA_VERSION = 9;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= openAndMigrate();
  return dbPromise;
}

export function resetDbForTests(): void {
  dbPromise = null;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // todo: audit pending
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // todo: audit pending
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion === 0) {
    // Fresh install: SCHEMA_SQL is always the current full schema.
    // todo: audit pending
    await db.execAsync(SCHEMA_SQL);
  } else {
    if (currentVersion < 3) {
      // v3: exercise detail screen needs secondary muscles alongside the primary one.
      // todo: audit pending
      await db.execAsync('ALTER TABLE exercises ADD COLUMN secondary_muscles TEXT;');
      await backfillSecondaryMuscles(db);
    }
    if (currentVersion < 4) {
      // v4: editable profile name on the Profile screen.
      // todo: audit pending
      await db.execAsync(
        "CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id = 0), name TEXT NOT NULL DEFAULT 'Alex Rivera');"
      );
    }
    if (currentVersion < 5) {
      // v5: theme selector on the Profile screen (system/light/dark).
      // todo: audit pending
      await db.execAsync("ALTER TABLE profile ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system';");
    }
    if (currentVersion < 6) {
      // v6: lifter profile fields (#15); drops the 'Alex Rivera' seeded default.
      // Transactional so a crash mid-migration can't leave columns half-added.
      await db.withTransactionAsync(async () => {
        // todo: audit pending
        await db.execAsync(
          "ALTER TABLE profile ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female', 'prefer_not_to_say'));"
        );
        // todo: audit pending
        await db.execAsync('ALTER TABLE profile ADD COLUMN birth_date TEXT;');
        // todo: audit pending
        await db.execAsync('ALTER TABLE profile ADD COLUMN height_cm REAL;');
        // todo: audit pending
        await db.execAsync('ALTER TABLE profile ADD COLUMN bodyweight_kg REAL;');
        // todo: audit pending
        await db.execAsync("UPDATE profile SET name = '' WHERE name = 'Alex Rivera';");
      });
    }
    if (currentVersion < 7) {
      // v7: replace nullable tracking_type overrides with required exercise_type
      // snapshots. This app is still pre-release, so dev installs can be rebuilt
      // instead of preserving old local rows.
      await rebuildDevSchema(db);
    }
    if (currentVersion < 8) {
      // v8: historical PR events separate "was a PR when logged" from the
      // current personal_records cache.
      await db.withTransactionAsync(async () => {
        // todo: audit pending
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS personal_record_events (
            id                  TEXT PRIMARY KEY,
            exercise_id         TEXT NOT NULL REFERENCES exercises(id),
            workout_id          TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
            workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
            logged_set_id       TEXT REFERENCES logged_sets(id) ON DELETE CASCADE,
            record_type         TEXT NOT NULL,
            scope               TEXT NOT NULL CHECK (scope IN ('set','exercise_session')),
            value               REAL NOT NULL,
            achieved_at         TEXT NOT NULL,
            formula_version     TEXT,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(exercise_id, record_type, workout_exercise_id, scope)
          );
          CREATE INDEX IF NOT EXISTS idx_personal_record_events_exercise
            ON personal_record_events(exercise_id, achieved_at DESC);
          CREATE INDEX IF NOT EXISTS idx_personal_record_events_set
            ON personal_record_events(logged_set_id);
          CREATE INDEX IF NOT EXISTS idx_personal_record_events_workout
            ON personal_record_events(workout_id);
        `);
        await backfillPersonalRecordState(db);
      });
    }
    if (currentVersion < 9) {
      await rebuildExerciseTablesWithoutTimerMetadata(db);
    }
  }

  if (currentVersion < LATEST_SCHEMA_VERSION) {
    // todo: audit pending
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
  }

  // todo: audit pending
  await db.execAsync("INSERT OR IGNORE INTO profile (id, name) VALUES (0, '');");
  await seedExercises(db);

  return db;
}

async function rebuildExerciseTablesWithoutTimerMetadata(db: SQLite.SQLiteDatabase): Promise<void> {
  // todo: audit pending
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      // todo: audit pending
      await db.execAsync(`
        CREATE TABLE routine_exercises_next (
          id                TEXT PRIMARY KEY,
          routine_id        TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
          exercise_id       TEXT NOT NULL REFERENCES exercises(id),
          position          INTEGER NOT NULL,
          superset_group_id TEXT,
          exercise_type     TEXT NOT NULL CHECK (
            exercise_type IN (
              'weight_reps',
              'reps_only',
              'weighted_bodyweight',
              'assisted_bodyweight',
              'duration',
              'duration_weight',
              'distance_duration',
              'weight_distance'
            )
          ),
          notes             TEXT
        );

        INSERT INTO routine_exercises_next
          (id, routine_id, exercise_id, position, superset_group_id, exercise_type, notes)
        SELECT id, routine_id, exercise_id, position, superset_group_id, exercise_type, notes
          FROM routine_exercises;

        DROP TABLE routine_exercises;
        ALTER TABLE routine_exercises_next RENAME TO routine_exercises;
        CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);

        CREATE TABLE workout_exercises_next (
          id                TEXT PRIMARY KEY,
          workout_id        TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          exercise_id       TEXT NOT NULL REFERENCES exercises(id),
          position          INTEGER NOT NULL,
          superset_group_id TEXT,
          exercise_type     TEXT NOT NULL CHECK (
            exercise_type IN (
              'weight_reps',
              'reps_only',
              'weighted_bodyweight',
              'assisted_bodyweight',
              'duration',
              'duration_weight',
              'distance_duration',
              'weight_distance'
            )
          ),
          notes             TEXT
        );

        INSERT INTO workout_exercises_next
          (id, workout_id, exercise_id, position, superset_group_id, exercise_type, notes)
        SELECT id, workout_id, exercise_id, position, superset_group_id, exercise_type, notes
          FROM workout_exercises;

        DROP TABLE workout_exercises;
        ALTER TABLE workout_exercises_next RENAME TO workout_exercises;
        CREATE INDEX idx_workout_exercises_workout ON workout_exercises(workout_id);
        CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id);
      `);
    });
  } finally {
    // todo: audit pending
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

async function rebuildDevSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // todo: audit pending
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    // todo: audit pending
    await db.execAsync(`
      DROP TABLE IF EXISTS personal_records;
      DROP TABLE IF EXISTS logged_sets;
      DROP TABLE IF EXISTS workout_exercises;
      DROP TABLE IF EXISTS workouts;
      DROP TABLE IF EXISTS routine_sets;
      DROP TABLE IF EXISTS routine_exercises;
      DROP TABLE IF EXISTS routines;
      DROP TABLE IF EXISTS exercises;
      DROP TABLE IF EXISTS profile;
    `);
    // todo: audit pending
    await db.execAsync(SCHEMA_SQL);
  } finally {
    // todo: audit pending
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
