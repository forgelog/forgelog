import { getDb, resetDbForTests } from '../index';
import { startWorkout, getActiveWorkout } from '../repositories/workouts';

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
