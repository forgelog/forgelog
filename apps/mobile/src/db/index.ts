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
