import * as SQLite from 'expo-sqlite';

import { backfillPersonalRecordState } from './personalRecordState';
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
        ALTER TABLE exercises
          ADD COLUMN is_history_placeholder INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE workout_replica_state (
          workout_id        TEXT PRIMARY KEY,
          started_at_ms     INTEGER NOT NULL CHECK (started_at_ms >= 0),
          state_kind        TEXT NOT NULL CHECK (state_kind IN ('active', 'finished', 'discarded')),
          ended_at_ms       INTEGER,
          changed_at_ms     INTEGER NOT NULL CHECK (changed_at_ms >= 0),
          writer            TEXT NOT NULL CHECK (writer IN ('phone', 'watch')),
          replica_json      TEXT NOT NULL
        );

        CREATE INDEX idx_workout_replica_generation
          ON workout_replica_state(started_at_ms DESC, workout_id DESC);

        CREATE TABLE workout_mailbox_state (
          id                         INTEGER PRIMARY KEY CHECK (id = 0),
          outbound_workout_id        TEXT,
          outbound_changed_at_ms     INTEGER,
          pending_watch_receipt_json TEXT,
          desired_mailbox_json       TEXT NOT NULL
        );

        INSERT INTO workout_mailbox_state
          (id, outbound_workout_id, outbound_changed_at_ms,
           pending_watch_receipt_json, desired_mailbox_json)
        VALUES
          (0, NULL, NULL, NULL,
           '{"protocol_version":1,"candidate":null,"watch_receipt":null}');

        CREATE TABLE active_workout_overlay (
          workout_id          TEXT PRIMARY KEY,
          alerted_types_json  TEXT NOT NULL DEFAULT '{}',
          record_events_json  TEXT NOT NULL DEFAULT '[]'
        );

        DELETE FROM personal_record_events;
        DELETE FROM personal_records;
        DELETE FROM workouts WHERE ended_at IS NULL;
      `);
      await backfillPersonalRecordState(db);
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
