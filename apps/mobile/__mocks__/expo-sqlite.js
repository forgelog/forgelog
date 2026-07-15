// In-memory SQLite adapter using better-sqlite3 for jest.
// Replaces the no-op stub so application-layer tests run against a real DB.
const BetterSqlite = require('better-sqlite3');

function stripDollar(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k.startsWith('$') ? k.slice(1) : k] = v === undefined ? null : v;
  }
  return out;
}

function makeDb(raw, state) {
  return {
    execAsync: async (sql) => {
      raw.exec(sql);
    },
    runAsync: async (sql, params) => {
      const stripped = stripDollar(params);
      const info = stripped != null ? raw.prepare(sql).run(stripped) : raw.prepare(sql).run();
      return { changes: info.changes, lastInsertRowId: info.lastInsertRowid };
    },
    getFirstAsync: async (sql, params) => {
      const stripped = stripDollar(params);
      const row = stripped != null ? raw.prepare(sql).get(stripped) : raw.prepare(sql).get();
      return row ?? null;
    },
    getAllAsync: async (sql, params) => {
      const stripped = stripDollar(params);
      return stripped != null ? raw.prepare(sql).all(stripped) : raw.prepare(sql).all();
    },
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    withExclusiveTransactionAsync: async (fn) => {
      const transaction = state.exclusiveTransactionQueue.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(makeDb(raw, state));
          raw.exec('COMMIT');
          return result;
        } catch (err) {
          raw.exec('ROLLBACK');
          throw err;
        }
      });
      state.exclusiveTransactionQueue = transaction.then(
        () => undefined,
        () => undefined
      );
      return transaction;
    },
    prepareAsync: async (sql) => {
      const stmt = raw.prepare(sql);
      return {
        executeAsync: async (params) => {
          const stripped = stripDollar(params);
          const info = stripped != null ? stmt.run(stripped) : stmt.run();
          return { changes: info.changes, lastInsertRowId: info.lastInsertRowid };
        },
        finalizeAsync: async () => {},
      };
    },
  };
}

module.exports = {
  openDatabaseAsync: async () =>
    makeDb(new BetterSqlite(':memory:'), {
      exclusiveTransactionQueue: Promise.resolve(),
    }),
};
