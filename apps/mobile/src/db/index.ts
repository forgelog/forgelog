import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';
import { backfillSecondaryMuscles, seedExercises } from './seed';

const DB_NAME = 'forgelog.db';

// Bump this and add an `if (currentVersion < N)` branch below whenever the
// schema changes, so existing installs migrate instead of losing data.
const LATEST_SCHEMA_VERSION = 6;

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

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion === 0) {
    // Fresh install: SCHEMA_SQL is always the current full schema.
    await db.execAsync(SCHEMA_SQL);
  } else {
    if (currentVersion < 2) {
      // v2: watch sync needs a per-session rest_seconds snapshot.
      await db.execAsync('ALTER TABLE workout_exercises ADD COLUMN rest_seconds INTEGER;');
    }
    if (currentVersion < 3) {
      // v3: exercise detail screen needs secondary muscles alongside the primary one.
      await db.execAsync('ALTER TABLE exercises ADD COLUMN secondary_muscles TEXT;');
      await backfillSecondaryMuscles(db);
    }
    if (currentVersion < 4) {
      // v4: editable profile name on the Profile screen.
      await db.execAsync(
        "CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id = 0), name TEXT NOT NULL DEFAULT 'Alex Rivera');"
      );
    }
    if (currentVersion < 5) {
      // v5: theme selector on the Profile screen (system/light/dark).
      await db.execAsync("ALTER TABLE profile ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system';");
    }
    if (currentVersion < 6) {
      // v6: lifter profile fields (#15); drops the 'Alex Rivera' seeded default.
      // Transactional so a crash mid-migration can't leave columns half-added.
      await db.withTransactionAsync(async () => {
        await db.execAsync(
          "ALTER TABLE profile ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female', 'prefer_not_to_say'));"
        );
        await db.execAsync('ALTER TABLE profile ADD COLUMN birth_date TEXT;');
        await db.execAsync('ALTER TABLE profile ADD COLUMN height_cm REAL;');
        await db.execAsync('ALTER TABLE profile ADD COLUMN bodyweight_kg REAL;');
        await db.execAsync("UPDATE profile SET name = '' WHERE name = 'Alex Rivera';");
      });
    }
  }

  if (currentVersion < LATEST_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
  }

  await db.execAsync("INSERT OR IGNORE INTO profile (id, name) VALUES (0, '');");
  await seedExercises(db);

  return db;
}
