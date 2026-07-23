import { getDb, resetDbForTests } from '../index';
import { mobileStoreForTests as mobileStore } from '../../test-utils/db';

const { start: startWorkout, getActive: getActiveWorkout } = mobileStore.workouts;

beforeEach(() => {
  resetDbForTests();
});

test('getDb() runs real schema and round-trips a workout', async () => {
  const workout = await startWorkout({ name: 'Smoke test' });
  expect(workout.id).toBeTruthy();

  const active = await getActiveWorkout();
  expect(active?.id).toBe(workout.id);
  expect(active?.name).toBe('Smoke test');
});

test('resetDbForTests gives each test a fresh DB', async () => {
  const active = await getActiveWorkout();
  expect(active).toBeNull();
});

test('migration 1 creates unconstrained exercise_type columns', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  expect(version?.user_version).toBeGreaterThanOrEqual(1);

  for (const table of ['exercises', 'routine_exercises', 'workout_exercises']) {
    const columns = await db.getAllAsync<{ name: string; notnull: number }>(
      `PRAGMA table_info(${table})`
    );
    const schema = await db.getFirstAsync<{ sql: string }>(
      'SELECT sql FROM sqlite_master WHERE type = $type AND name = $table',
      { $type: 'table', $table: table }
    );
    expect(columns.some((column) => column.name === 'tracking_type')).toBe(false);
    expect(columns.find((column) => column.name === 'exercise_type')?.notnull).toBe(1);
    expect(schema?.sql).toContain('exercise_type');
    expect(schema?.sql).toContain('NOT NULL');
    expect(schema?.sql).not.toContain('CHECK');
  }
});

test('migration 2 creates and seeds measurement tables', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const types = await db.getAllAsync<{
    id: string;
    name: string;
    dimension: string;
    canonical_unit: string;
    position: number;
  }>(
    'SELECT id, name, dimension, canonical_unit, position FROM measurement_types ORDER BY position'
  );

  expect(version?.user_version).toBeGreaterThanOrEqual(2);
  expect(types).toHaveLength(18);
  expect(types[0]).toEqual({
    id: 'bodyweight',
    name: 'Body Weight',
    dimension: 'mass',
    canonical_unit: 'kg',
    position: 0,
  });
  expect(types[17]).toEqual({
    id: 'right_calf',
    name: 'Right Calf',
    dimension: 'length',
    canonical_unit: 'cm',
    position: 17,
  });

  const measurementSchema = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'measurements'`
  );
  expect(measurementSchema?.sql).toContain('CHECK (canonical_value >= 0)');
});

test('migration 4 creates active sync durability tables and enforces one active workout', async () => {
  const db = await getDb();
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'active_workout_%'`
  );
  expect(version?.user_version).toBeGreaterThanOrEqual(4);
  expect(tables.map((row) => row.name)).toEqual(
    expect.arrayContaining([
      'active_workout_coordinator',
      'active_workout_devices',
      'active_workout_operations',
      'active_workout_receipts',
      'active_workout_conflict_keys',
      'active_workout_tombstones',
      'active_workout_pr_baselines',
      'active_workout_alerts',
    ])
  );

  const activeIndex = await db.getFirstAsync<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_workouts_single_active'`
  );
  const activeTriggers = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_workouts_single_active_%'`
  );
  expect(activeIndex?.sql).toContain('WHERE ended_at IS NULL');
  expect(activeTriggers.map((row) => row.name)).toEqual(expect.arrayContaining([
    'trg_workouts_single_active_insert',
    'trg_workouts_single_active_update',
  ]));
});
