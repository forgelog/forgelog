// Test-only stub so modules that import the db layer can load under jest-expo
// (the real native module needs expo-asset, which isn't available in node).
// Screen behaviour is verified on-device, not here.
const db = {
  execAsync: async () => {},
  runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
  getFirstAsync: async () => null,
  getAllAsync: async () => [],
  prepareAsync: async () => ({ executeAsync: async () => {}, finalizeAsync: async () => {} }),
  withTransactionAsync: async (fn) => fn(),
};

module.exports = {
  openDatabaseAsync: async () => db,
};
