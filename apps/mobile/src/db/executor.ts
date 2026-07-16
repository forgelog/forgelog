import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * SQLite operations available to repositories.
 *
 * Both Expo's database connection and the handle passed to
 * `withExclusiveTransactionAsync` satisfy this type. Connection lifecycle and
 * transaction-opening methods are intentionally excluded so repository code
 * cannot close the shared connection or start a nested transaction.
 */
export type DatabaseExecutor = Pick<
  SQLiteDatabase,
  'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'prepareAsync'
>;
