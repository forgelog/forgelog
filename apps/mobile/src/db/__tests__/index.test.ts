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

test('fresh schema requires canonical exercise_type columns', async () => {
  const db = await getDb();

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
    expect(schema?.sql).toContain('weight_reps');
    expect(schema?.sql).toContain('weight_distance');
  }
});
