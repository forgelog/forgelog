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
