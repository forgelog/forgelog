import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { currentWeekDays, monthLabel } from '../../domain/dates';
import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  mobileStoreForTests as mobileStore,
  seededExercise,
  setWorkoutTimestamps,
} from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { EditWorkoutScreen } from '../EditWorkoutScreen';
import { HistoryScreen } from '../HistoryScreen';
import { RoutineEditorScreen } from '../RoutineEditorScreen';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

jest.mock('@expo/ui/community/bottom-sheet');

const { replaceCurrentForExercise: replaceRecordsForExercise } = mobileStore.records;
const { getDetail: getRoutineDetail } = mobileStore.routines;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  start: startWorkout,
  setSetCompletion,
  updateSetValues: updateLoggedSetValues,
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
  await updateLoggedSetValues(set.id, { weight: 100, reps: 5 });
  await setSetCompletion(set.id, true);
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(workout.id, '2026-07-11T09:00:00.000Z', '2026-07-11T10:05:00.000Z');
  await replaceRecordsForExercise(bench.id);
  return { bench, workout, set };
}

function renderHistoryStack() {
  return renderWithStack<TestStackParamList>([
    { name: 'History', component: HistoryScreen },
    { name: 'WorkoutDetail', component: WorkoutDetailScreen },
    { name: 'RoutineEditor', component: RoutineEditorScreen },
    { name: 'EditWorkout', component: EditWorkoutScreen },
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

test('saves a historical workout as an editable routine draft', async () => {
  await createFinishedBenchWorkout('Phase Six Push');
  const history = await renderHistoryStack();

  await waitFor(() => expect(history.getByLabelText('Workout options Phase Six Push')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Workout options Phase Six Push'));

  await waitFor(() => expect(history.getByTestId('workout-actions-sheet')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Save as routine from Phase Six Push'));

  await waitFor(() => expect(history.getByDisplayValue('Phase Six Push')).toBeTruthy());
  expect(history.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy();
  expect(history.getByTestId('routine-set-0-0-weight').props.value).toBe('100');
  expect(history.getByTestId('routine-set-0-0-reps').props.value).toBe('5');

  await act(async () => fireEvent.changeText(history.getByLabelText('Routine name'), 'Saved Push'));
  await act(async () => fireEvent.press(history.getByText('Save')));

  const db = await getDb();
  const row = await waitFor(async () => {
    const savedRow = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM routines WHERE name = $name',
      { $name: 'Saved Push' }
    );
    if (!savedRow) throw new Error('Routine not saved yet');
    return savedRow;
  });
  const saved = await getRoutineDetail(row.id);
  expect(saved).toMatchObject({
    name: 'Saved Push',
    exercises: [
      expect.objectContaining({
        exercise_id: 'Barbell_Bench_Press_-_Medium_Grip',
        sets: [expect.objectContaining({ target_weight: 100, target_reps: 5 })],
      }),
    ],
  });
});

test('edits a historical workout name from the workout options sheet', async () => {
  await createFinishedBenchWorkout('Phase Six Push');
  const history = await renderHistoryStack();

  await waitFor(() => expect(history.getByLabelText('Workout options Phase Six Push')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Workout options Phase Six Push'));

  await waitFor(() => expect(history.getByTestId('workout-actions-sheet')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Edit workout Phase Six Push'));

  await waitFor(() => expect(history.getByDisplayValue('Phase Six Push')).toBeTruthy());
  await act(async () => fireEvent.changeText(history.getByLabelText('Workout name'), 'Renamed Push'));
  await act(async () => fireEvent.press(history.getByLabelText('Save workout')));

  await waitFor(() => expect(history.getByLabelText('Open workout Renamed Push')).toBeTruthy());
  expect(history.queryByLabelText('Open workout Phase Six Push')).toBeNull();
});

test('closes the workout edit screen without saving or showing a discard alert', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  await createFinishedBenchWorkout('Phase Six Push');
  const history = await renderHistoryStack();

  await waitFor(() => expect(history.getByLabelText('Workout options Phase Six Push')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Workout options Phase Six Push'));

  await waitFor(() => expect(history.getByTestId('workout-actions-sheet')).toBeTruthy());
  fireEvent.press(history.getByLabelText('Edit workout Phase Six Push'));

  await waitFor(() => expect(history.getByDisplayValue('Phase Six Push')).toBeTruthy());
  await act(async () => fireEvent.changeText(history.getByLabelText('Workout name'), 'Unsaved Push'));
  await act(async () => fireEvent.press(history.getByLabelText('Close')));

  expect(alertSpy).not.toHaveBeenCalled();
  await waitFor(() => expect(history.getByLabelText('Open workout Phase Six Push')).toBeTruthy());
  expect(history.queryByLabelText('Open workout Unsaved Push')).toBeNull();
});

test('reports a repository load failure', async () => {
  const db = await getDb();
  // todo: audit pending
  await db.execAsync('DROP TABLE workouts');

  const { getByText } = await renderHistoryStack();

  await waitFor(() => expect(getByText('Could not load workout history.')).toBeTruthy());
});
