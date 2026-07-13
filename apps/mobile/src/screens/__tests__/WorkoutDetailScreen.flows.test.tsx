import { cleanup, waitFor } from '@testing-library/react-native';

import { getDb, resetDbForTests } from '../../db/index';
import { replaceRecordsForExercise } from '../../db/repositories/personalRecords';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  startWorkout,
  updateLoggedSet,
} from '../../db/repositories/workouts';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { seededExercise, setWorkoutTimestamps } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

type TestStackParamList = RootStackParamList;

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  cleanup();
});

function renderWorkoutDetail(workoutId: string) {
  return renderWithStack<TestStackParamList>([
    { name: 'WorkoutDetail', component: WorkoutDetailScreen, initialParams: { workoutId } },
  ]);
}

test('shows PR badges from persisted record events', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');

  const baseline = await startWorkout({ name: 'Baseline Bench' });
  const baselineExercise = await addExerciseToWorkout(baseline.id, bench.id);
  const baselineSet = await addSet(baselineExercise.id);
  await updateLoggedSet(baselineSet.id, { weight: 100, reps: 5, completed: true });
  await finishWorkout(baseline.id);
  await setWorkoutTimestamps(
    baseline.id,
    '2026-07-04T09:00:00.000Z',
    '2026-07-04T10:05:00.000Z'
  );

  const workout = await startWorkout({ name: 'Bench PR Day' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSet(set.id, { weight: 110, reps: 5, completed: true });
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(
    workout.id,
    '2026-07-11T09:00:00.000Z',
    '2026-07-11T10:05:00.000Z'
  );
  await replaceRecordsForExercise(bench.id);

  const db = await getDb();
  const eventCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM personal_record_events WHERE logged_set_id = $setId',
    { $setId: set.id }
  );
  expect(eventCount?.count).toBeGreaterThan(0);

  const detail = await renderWorkoutDetail(workout.id);

  await waitFor(() => expect(detail.getByText('Bench PR Day')).toBeTruthy());
  expect(detail.getByText('110 kg × 5 reps')).toBeTruthy();
  expect(detail.getAllByText('PR').length).toBeGreaterThan(0);
});
