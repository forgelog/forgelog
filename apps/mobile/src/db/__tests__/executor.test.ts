import type { SQLiteDatabase } from 'expo-sqlite';

import type { DatabaseExecutor } from '../executor';
import { getDb, resetDbForTests } from '../index';

type ExclusiveTransaction = Parameters<
  Parameters<SQLiteDatabase['withExclusiveTransactionAsync']>[0]
>[0];

type ExecutorCompatibility = [
  SQLiteDatabase extends DatabaseExecutor ? true : false,
  ExclusiveTransaction extends DatabaseExecutor ? true : false,
];

const executorCompatibility: ExecutorCompatibility = [true, true];

beforeEach(() => {
  resetDbForTests();
});

test('database connections and exclusive transactions satisfy DatabaseExecutor', async () => {
  const executor: DatabaseExecutor = await getDb();
  // todo: audit pending
  const row = await executor.getFirstAsync<{ value: number }>('SELECT 1 AS value');

  expect(executorCompatibility).toEqual([true, true]);
  expect(row).toEqual({ value: 1 });
});
