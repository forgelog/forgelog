import * as SQLite from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';

const DB_NAME = 'forgelog.db';

// Bump this and add an `if (currentVersion < N)` branch below whenever the
// schema changes, so existing installs migrate instead of losing data.
const LATEST_SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion < LATEST_SCHEMA_VERSION) {
    await db.execAsync(SCHEMA_SQL);
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
  }

  return db;
}
