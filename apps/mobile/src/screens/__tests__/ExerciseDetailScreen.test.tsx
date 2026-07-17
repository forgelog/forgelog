import { cleanup, fireEvent, waitFor } from '@testing-library/react-native';

import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  mobileStoreForTests as mobileStore,
  seededExercise,
  setWorkoutTimestamps,
} from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';

const {
  getForExercise: getRecordsForExercise,
  replaceCurrentForExercise: replaceRecordsForExercise,
} = mobileStore.records;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  start: startWorkout,
  setSetCompletion,
  updateSetValues: updateLoggedSetValues,
} = mobileStore.workouts;

type TestStackParamList = RootStackParamList;

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

async function createFinishedBenchWorkout(name = 'Bench PR Day') {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const baseline = await startWorkout({ name: 'Baseline Bench' });
  const baselineExercise = await addExerciseToWorkout(baseline.id, bench.id);
  const baselineSet = await addSet(baselineExercise.id);
  await updateLoggedSetValues(baselineSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(baselineSet.id, true);
  await finishWorkout(baseline.id);
  await setWorkoutTimestamps(baseline.id, '2026-07-04T09:00:00.000Z', '2026-07-04T10:05:00.000Z');

  const workout = await startWorkout({ name });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await setSetCompletion(set.id, true);
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(workout.id, '2026-07-11T09:00:00.000Z', '2026-07-11T10:05:00.000Z');
  await replaceRecordsForExercise(bench.id);
  return { bench, workout, set };
}

function renderExerciseDetail(exerciseId: string) {
  return renderWithStack<TestStackParamList>([
    { name: 'ExerciseDetail', component: ExerciseDetailScreen, initialParams: { exerciseId } },
  ]);
}

test('shows exercise about details', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const detail = await renderExerciseDetail(bench.id);

  await waitFor(() => expect(detail.getByText('MUSCLES WORKED')).toBeTruthy());
  expect(detail.getByText('Primary')).toBeTruthy();
  expect(detail.getByText('Equipment')).toBeTruthy();
});

test('shows logged history with PR badges', async () => {
  const { bench } = await createFinishedBenchWorkout('Bench PR Day');
  const records = await getRecordsForExercise(bench.id);
  expect(records.find((record) => record.record_type === 'max_weight')?.value).toBe(110);

  const detail = await renderExerciseDetail(bench.id);

  await waitFor(() => expect(detail.getByText('MUSCLES WORKED')).toBeTruthy());
  fireEvent.press(detail.getByLabelText('History tab'));
  await waitFor(() => expect(detail.getByText('Bench PR Day')).toBeTruthy());
  expect(detail.getByText('110 kg × 5 reps')).toBeTruthy();
  expect(detail.getAllByText(/PR/).length).toBeGreaterThan(0);
});

test('shows empty history for an exercise with no history entries', async () => {
  const squat = await seededExercise('Barbell Squat');
  const empty = await renderExerciseDetail(squat.id);

  await waitFor(() => expect(empty.getByText('MUSCLES WORKED')).toBeTruthy());
  fireEvent.press(empty.getByLabelText('History tab'));
  await waitFor(() => expect(empty.getByText('No exercise history yet.')).toBeTruthy());
});

test('keeps the about tab available when history loading fails', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const db = await getDb();
  // todo: audit pending
  await db.execAsync('DROP TABLE personal_record_events');

  const detail = await renderExerciseDetail(bench.id);

  await waitFor(() => expect(detail.getByText('MUSCLES WORKED')).toBeTruthy());
  fireEvent.press(detail.getByLabelText('History tab'));
  await waitFor(() => expect(detail.getByText('Could not load exercise history.')).toBeTruthy());
});

test('shows a missing-exercise state', async () => {
  const missing = await renderExerciseDetail('missing-exercise');

  await waitFor(() => expect(missing.getByText('Exercise not found.')).toBeTruthy());
});
