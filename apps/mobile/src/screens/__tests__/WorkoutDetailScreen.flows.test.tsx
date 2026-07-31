import { cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  mobileStoreForTests as mobileStore,
  seededExercise,
  setWorkoutTimestamps,
} from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

const { replaceCurrentForExercise: replaceRecordsForExercise } = mobileStore.records;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  start: startWorkout,
  setSetCompletion,
  updateSetValues: updateLoggedSetValues,
} = mobileStore.workouts;

type TestStackParamList = RootStackParamList;

function EmptyScreen() {
  return null;
}

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

function renderWorkoutDetail(workoutId: string) {
  return renderWithStack<TestStackParamList>(
    [
      { name: 'MainTabs', component: EmptyScreen },
      { name: 'WorkoutDetail', component: WorkoutDetailScreen },
    ],
    {
      index: 1,
      routes: [
        { name: 'MainTabs' },
        { name: 'WorkoutDetail', params: { workoutId } },
      ],
    }
  );
}

test('shows PR badges from persisted record events', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');

  const baseline = await startWorkout({ name: 'Baseline Bench' });
  const baselineExercise = await addExerciseToWorkout(baseline.id, bench.id);
  const baselineSet = await addSet(baselineExercise.id);
  await updateLoggedSetValues(baselineSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(baselineSet.id, true);
  await finishWorkout(baseline.id);
  await setWorkoutTimestamps(baseline.id, '2026-07-04T09:00:00.000Z', '2026-07-04T10:05:00.000Z');

  const workout = await startWorkout({ name: 'Bench PR Day' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await setSetCompletion(set.id, true);
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(workout.id, '2026-07-11T09:00:00.000Z', '2026-07-11T10:05:00.000Z');
  await replaceRecordsForExercise(bench.id);

  const db = await getDb();
  // todo: audit pending
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

test('deletes a completed workout from workout details', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const workout = await startWorkout({ name: 'Delete from history' });
  await finishWorkout(workout.id);
  const detail = await renderWorkoutDetail(workout.id);

  await waitFor(() => expect(detail.getByText('Delete from history')).toBeTruthy());
  fireEvent.press(detail.getByRole('button', { name: 'Delete workout' }));

  const deleteAction = alertSpy.mock.calls[0]?.[2]?.find((button) => button.text === 'Delete');
  await deleteAction?.onPress?.();

  await waitFor(async () =>
    expect(await mobileStore.workouts.getDetail(workout.id)).toBeNull()
  );
});
