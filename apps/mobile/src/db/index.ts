import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';
import { seedExercises } from './seed';

type Migration = {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

const DB_NAME = 'forgelog-v1.db';

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(SCHEMA_SQL);
    },
  },
  {
    version: 2,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE measurement_types (
          id             TEXT PRIMARY KEY,
          name           TEXT NOT NULL,
          dimension      TEXT NOT NULL CHECK (
            dimension IN ('mass', 'percentage', 'length')
          ),
          canonical_unit TEXT NOT NULL,
          position       INTEGER NOT NULL,

          CHECK (
            (dimension = 'mass'       AND canonical_unit = 'kg') OR
            (dimension = 'percentage' AND canonical_unit = '%')  OR
            (dimension = 'length'     AND canonical_unit = 'cm')
          )
        );

        CREATE TABLE measurements (
          id                  TEXT PRIMARY KEY,
          measurement_type_id TEXT NOT NULL REFERENCES measurement_types(id),
          canonical_value     REAL NOT NULL CHECK (canonical_value >= 0),
          measured_at         TEXT NOT NULL,
          notes               TEXT,
          created_at          TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_measurements_type_recency
          ON measurements(measurement_type_id, measured_at DESC, created_at DESC);

        INSERT INTO measurement_types
          (id, name, dimension, canonical_unit, position)
        VALUES
          ('bodyweight',       'Body Weight',      'mass',       'kg',  0),
          ('body_fat',         'Body Fat',         'percentage', '%',   1),
          ('lean_body_mass',   'Lean Body Mass',   'mass',       'kg',  2),
          ('waist',            'Waist',            'length',     'cm',  3),
          ('neck',             'Neck',             'length',     'cm',  4),
          ('shoulder',         'Shoulder',          'length',     'cm',  5),
          ('chest',            'Chest',             'length',     'cm',  6),
          ('left_bicep',       'Left Bicep',        'length',     'cm',  7),
          ('right_bicep',      'Right Bicep',       'length',     'cm',  8),
          ('left_forearm',     'Left Forearm',      'length',     'cm',  9),
          ('right_forearm',    'Right Forearm',     'length',     'cm', 10),
          ('upper_abs',        'Upper Abs',         'length',     'cm', 11),
          ('lower_abs',        'Lower Abs',         'length',     'cm', 12),
          ('hips',             'Hips',              'length',     'cm', 13),
          ('left_thigh',       'Left Thigh',        'length',     'cm', 14),
          ('right_thigh',      'Right Thigh',       'length',     'cm', 15),
          ('left_calf',        'Left Calf',         'length',     'cm', 16),
          ('right_calf',       'Right Calf',        'length',     'cm', 17);
      `);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        ALTER TABLE workout_exercises
          ADD COLUMN source_routine_exercise_id TEXT;

        ALTER TABLE logged_sets
          ADD COLUMN source_routine_set_id TEXT;

        ALTER TABLE workouts
          ADD COLUMN routine_structure_version INTEGER;
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      await db.execAsync(`
        CREATE UNIQUE INDEX idx_workouts_single_active
          ON workouts ((1)) WHERE ended_at IS NULL;
        CREATE TRIGGER trg_workouts_single_active_insert
          BEFORE INSERT ON workouts
          WHEN NEW.ended_at IS NULL AND EXISTS (SELECT 1 FROM workouts WHERE ended_at IS NULL)
          BEGIN SELECT RAISE(ABORT, 'only one active workout is allowed'); END;
        CREATE TRIGGER trg_workouts_single_active_update
          BEFORE UPDATE OF ended_at ON workouts
          WHEN NEW.ended_at IS NULL AND EXISTS (
            SELECT 1 FROM workouts WHERE ended_at IS NULL AND id != NEW.id
          )
          BEGIN SELECT RAISE(ABORT, 'only one active workout is allowed'); END;

        CREATE TABLE active_workout_coordinator (
          singleton                  INTEGER PRIMARY KEY CHECK (singleton = 1),
          installation_id            TEXT NOT NULL,
          coordinator_epoch          TEXT NOT NULL,
          revision                   INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
          revision_committed_at      TEXT NOT NULL,
          lifecycle                  TEXT NOT NULL CHECK (lifecycle IN ('none', 'active', 'finished', 'discarded')),
          workout_id                 TEXT,
          publish_needed_revision    INTEGER,
          legacy_workout_id          TEXT,
          initialized_at             TEXT NOT NULL
        );

        CREATE TABLE active_workout_devices (
          coordinator_epoch          TEXT NOT NULL,
          device_id                  TEXT NOT NULL,
          last_finalized_sequence    INTEGER NOT NULL DEFAULT 0,
          last_seen_at               TEXT NOT NULL,
          acknowledged_revision      INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (coordinator_epoch, device_id)
        );

        CREATE TABLE active_workout_operations (
          operation_id               TEXT PRIMARY KEY,
          coordinator_epoch          TEXT NOT NULL,
          device_id                  TEXT NOT NULL,
          device_sequence            INTEGER NOT NULL,
          workout_id                 TEXT,
          base_revision              INTEGER,
          predecessor_operation_id   TEXT,
          payload_hash               TEXT NOT NULL,
          payload_json               TEXT,
          status                     TEXT NOT NULL,
          result_json                TEXT NOT NULL,
          accepted_revision          INTEGER,
          publish_needed             INTEGER NOT NULL DEFAULT 1,
          retained_until             TEXT,
          UNIQUE (coordinator_epoch, device_id, device_sequence)
        );

        CREATE TABLE active_workout_receipts (
          coordinator_epoch          TEXT NOT NULL,
          device_id                  TEXT NOT NULL,
          device_sequence            INTEGER NOT NULL,
          operation_id               TEXT,
          payload_hash               TEXT NOT NULL,
          disposition                TEXT NOT NULL,
          canonical_revision         INTEGER NOT NULL,
          minimal_result_json        TEXT NOT NULL,
          PRIMARY KEY (coordinator_epoch, device_id, device_sequence)
        );

        CREATE TABLE active_workout_conflict_keys (
          conflict_key               TEXT PRIMARY KEY,
          revision                   INTEGER NOT NULL,
          operation_id               TEXT,
          device_id                  TEXT NOT NULL,
          device_sequence            INTEGER,
          resolution_audit_id        TEXT
        );

        CREATE TABLE active_workout_tombstones (
          entity_key                 TEXT PRIMARY KEY,
          workout_id                 TEXT NOT NULL,
          deleted_revision           INTEGER NOT NULL,
          operation_id               TEXT,
          deleted_at                 TEXT NOT NULL
        );

        CREATE TABLE active_workout_pr_baselines (
          workout_exercise_id        TEXT NOT NULL,
          record_type                TEXT NOT NULL,
          value                      REAL NOT NULL,
          PRIMARY KEY (workout_exercise_id, record_type),
          FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
        );

        CREATE TABLE active_workout_alerts (
          workout_exercise_id        TEXT NOT NULL,
          record_type                TEXT NOT NULL,
          PRIMARY KEY (workout_exercise_id, record_type),
          FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_active_workout_operations_publish
          ON active_workout_operations(publish_needed, coordinator_epoch, device_id, device_sequence);
        CREATE INDEX idx_active_workout_tombstones_workout
          ON active_workout_tombstones(workout_id);
      `);
    },
  },
];

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
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    await db.withExclusiveTransactionAsync(async (transaction) => {
      await migration.up(transaction);
      await transaction.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }

  await seedExercises(db);

  return db;
}
