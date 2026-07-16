import { cleanup, fireEvent, waitFor } from '@testing-library/react-native';

import { currentWeekDays, monthLabel } from '../../domain/dates';
import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  mobileStoreForTests as mobileStore,
  seededExercise,
  setWorkoutTimestamps,
} from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { HistoryScreen } from '../HistoryScreen';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

const { replaceCurrentForExercise: replaceRecordsForExercise } = mobileStore.records;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  start: startWorkout,
  updateSet: updateLoggedSet,
} = mobileStore.workouts;

type TestStackParamList = RootStackParamList & {
  History: undefined;
};

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

async function createFinishedBenchWorkout(name = 'Phase Six Push') {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSet(set.id, { weight: 100, reps: 5, completed: true });
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(workout.id, '2026-07-11T09:00:00.000Z', '2026-07-11T10:05:00.000Z');
  await replaceRecordsForExercise(bench.id);
  return { bench, workout, set };
}

function renderHistoryStack() {
  return renderWithStack<TestStackParamList>([
    { name: 'History', component: HistoryScreen },
    { name: 'WorkoutDetail', component: WorkoutDetailScreen },
  ]);
}

test('shows the current week and empty state', async () => {
  const todayDates = currentWeekDays(new Date()).map((day) => String(day.getDate()));
  const history = await renderHistoryStack();

  await waitFor(() => expect(history.getByText('No finished workouts yet.')).toBeTruthy());
  for (const day of todayDates) {
    expect(history.getByText(day)).toBeTruthy();
  }
});

test('groups finished workouts by month and opens workout detail', async () => {
  await createFinishedBenchWorkout('Phase Six Push');
  const { getByLabelText, getByText } = await renderHistoryStack();

  await waitFor(() =>
    expect(getByText(monthLabel(new Date('2026-07-11T09:00:00.000Z')))).toBeTruthy()
  );
  fireEvent.press(getByLabelText('Open workout Phase Six Push'));

  await waitFor(() => expect(getByText('100 kg × 5 reps')).toBeTruthy());
  expect(getByText('Done')).toBeTruthy();
});

test('reports a repository load failure', async () => {
  const db = await getDb();
  // todo: audit pending
  await db.execAsync('DROP TABLE workouts');

  const { getByText } = await renderHistoryStack();

  await waitFor(() => expect(getByText('Could not load workout history.')).toBeTruthy());
});
