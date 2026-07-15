import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { DatabaseExecutor } from '../executor';
import * as schema from './schema';

export type OrmDatabase = ExpoSQLiteDatabase<typeof schema>;

const ormByExecutor = new WeakMap<DatabaseExecutor, OrmDatabase>();

export function getOrm(db: DatabaseExecutor): OrmDatabase {
  // Executors are either SQLiteDatabase or Expo's transaction subclass. The
  // narrower public type prevents repositories from managing the connection.
  let orm = ormByExecutor.get(db);
  if (!orm) {
    orm = drizzle(db as SQLiteDatabase, { schema });
    ormByExecutor.set(db, orm);
  }
  return orm;
}

export * from './schema';
