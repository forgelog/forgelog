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
          ('bodyweight',       'Bodyweight',       'mass',       'kg',  0),
          ('body_fat',         'Body fat',         'percentage', '%',   1),
          ('lean_body_mass',   'Lean body mass',   'mass',       'kg',  2),
          ('waist',            'Waist',            'length',     'cm',  3),
          ('neck',             'Neck',             'length',     'cm',  4),
          ('shoulder',         'Shoulder',          'length',     'cm',  5),
          ('chest',            'Chest',             'length',     'cm',  6),
          ('left_bicep',       'Left bicep',        'length',     'cm',  7),
          ('right_bicep',      'Right bicep',       'length',     'cm',  8),
          ('left_forearm',     'Left forearm',      'length',     'cm',  9),
          ('right_forearm',    'Right forearm',     'length',     'cm', 10),
          ('upper_abs',        'Upper abs',         'length',     'cm', 11),
          ('lower_abs',        'Lower abs',         'length',     'cm', 12),
          ('hips',             'Hips',              'length',     'cm', 13),
          ('left_thigh',       'Left thigh',        'length',     'cm', 14),
          ('right_thigh',      'Right thigh',       'length',     'cm', 15),
          ('left_calf',        'Left calf',         'length',     'cm', 16),
          ('right_calf',       'Right calf',        'length',     'cm', 17);
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
