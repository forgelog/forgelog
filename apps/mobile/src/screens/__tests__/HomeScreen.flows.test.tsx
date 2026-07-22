import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { latestAlertButtons } from '../../test-utils/async';
import { mobileStoreForTests as mobileStore, seededExercise } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';
import { HomeScreen } from '../HomeScreen';
import { RoutineDetailScreen } from '../RoutineDetailScreen';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

const { saveDraft: saveRoutineDraft } = mobileStore.routines;
const {
  getActive: getActiveWorkout,
  getDetail: getWorkoutDetail,
  start: startWorkout,
} = mobileStore.workouts;

jest.mock('@expo/ui/community/bottom-sheet');

type TestStackParamList = RootStackParamList & {
  Home: undefined;
};

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

async function createRoutineWithBench(name = 'Phase Six Push') {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await saveRoutineDraft({
    name,
    notes: null,
    exercises: [
      {
        exercise_id: bench.id,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 100,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });
  return { bench, routine };
}

function renderHomeStack() {
  return renderWithStack<TestStackParamList>([
    { name: 'Home', component: HomeScreen },
    { name: 'ActiveWorkout', component: ActiveWorkoutScreen },
    { name: 'RoutineDetail', component: RoutineDetailScreen },
    { name: 'RoutineEditor', component: RoutineEditorScreen },
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
    { name: 'ExerciseDetail', component: ExerciseDetailScreen },
  ]);
}

test('shows empty routines', async () => {
  const home = await renderHomeStack();

  await waitFor(() =>
    expect(home.getByText('No saved routines yet. Create one above.')).toBeTruthy()
  );
});

test('shows a load-error state when routines fail to load', async () => {
  const db = await getDb();
  // todo: audit pending
  await db.execAsync('DROP TABLE routines');

  const error = await renderHomeStack();

  await waitFor(() => expect(error.getByText('Could not load routines.')).toBeTruthy());
});

test('starts an empty workout', async () => {
  const { getByLabelText, getByText } = await renderHomeStack();

  await waitFor(() => expect(getByLabelText('Start Empty Workout')).toBeTruthy());
  fireEvent.press(getByLabelText('Start Empty Workout'));
  await waitFor(() => expect(getByText('Add Exercise')).toBeTruthy());
});

test('creates and saves a routine from the inline starter-routine sheet', async () => {
  const home = await renderHomeStack();

  await waitFor(() => expect(home.getByLabelText('Starter routine Push Day')).toBeTruthy());
  fireEvent.press(home.getByLabelText('Starter routine Push Day'));
  await waitFor(() => expect(home.getByTestId('starter-routine-actions-sheet')).toBeTruthy());
  fireEvent.press(home.getByLabelText('Create routine from Push Day'));

  await waitFor(() => expect(home.getByDisplayValue('Push Day')).toBeTruthy());
  expect(home.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy();
  fireEvent.press(home.getByText('Save'));

  await waitFor(() => expect(home.getByLabelText('View routine Push Day')).toBeTruthy());
});

test('starts a workout from a routine', async () => {
  await createRoutineWithBench('Routine Launch');
  const routineLaunch = await renderHomeStack();

  await waitFor(() =>
    expect(routineLaunch.getByLabelText('Start routine Routine Launch')).toBeTruthy()
  );
  fireEvent.press(routineLaunch.getByLabelText('Start routine Routine Launch'));
  await waitFor(() =>
    expect(routineLaunch.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy()
  );
  expect(routineLaunch.getByTestId('workout-set-0-0-weight').props.value).toBe('100');
});

test('opens a routine in read-only detail mode from the routine row', async () => {
  await createRoutineWithBench('Read Only Push');
  const routineDetail = await renderHomeStack();

  await waitFor(() =>
    expect(routineDetail.getByLabelText('View routine Read Only Push')).toBeTruthy()
  );
  fireEvent.press(routineDetail.getByLabelText('View routine Read Only Push'));

  await waitFor(() =>
    expect(routineDetail.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy()
  );
  expect(routineDetail.getByText('100 kg × 5 reps')).toBeTruthy();
  expect(routineDetail.queryByLabelText('Routine name')).toBeNull();
  expect(routineDetail.queryByLabelText('Add Exercise')).toBeNull();
});

test('shows routine options in a bottom sheet and opens the editor from Edit Routine', async () => {
  await createRoutineWithBench('Menu Push');
  const options = await renderHomeStack();

  await waitFor(() => expect(options.getByLabelText('Routine options Menu Push')).toBeTruthy());
  fireEvent.press(options.getByLabelText('Routine options Menu Push'));

  await waitFor(() => expect(options.getByTestId('routine-actions-sheet')).toBeTruthy());
  expect(options.getByLabelText('Edit Routine')).toBeTruthy();
  expect(options.getByLabelText('Delete Routine')).toBeTruthy();
  fireEvent.press(options.getByLabelText('Edit Routine'));

  await waitFor(() => expect(options.getByDisplayValue('Menu Push')).toBeTruthy());
  expect(options.getByLabelText('Routine name')).toBeTruthy();
});

test('confirms routine deletion inside the bottom sheet', async () => {
  await createRoutineWithBench('Delete Me');
  const deleteFlow = await renderHomeStack();

  await waitFor(() => expect(deleteFlow.getByLabelText('Routine options Delete Me')).toBeTruthy());
  fireEvent.press(deleteFlow.getByLabelText('Routine options Delete Me'));

  await waitFor(() => expect(deleteFlow.getByLabelText('Delete Routine')).toBeTruthy());
  fireEvent.press(deleteFlow.getByLabelText('Delete Routine'));

  await waitFor(() => expect(deleteFlow.getByText('Delete this routine?')).toBeTruthy());
  fireEvent.press(deleteFlow.getByLabelText('Confirm delete routine'));

  await waitFor(() => expect(deleteFlow.queryByText('Delete Me')).toBeNull());
  expect(deleteFlow.getByText('No saved routines yet. Create one above.')).toBeTruthy();
});

test('guards active-workout conflicts when starting a routine', async () => {
  await createRoutineWithBench('Guarded Routine');
  const existing = await startWorkout({ name: 'Already Active' });
  const guard = await renderHomeStack();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(guard.getByLabelText('Start routine Guarded Routine')).toBeTruthy());
  fireEvent.press(guard.getByLabelText('Start routine Guarded Routine'));
  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith(
      'Workout in progress',
      expect.any(String),
      expect.any(Array)
    )
  );

  const discardButton = latestAlertButtons(alertSpy).find(
    (button) => button.text === 'Discard & start'
  );
  await act(async () => {
    await discardButton?.onPress?.();
  });

  await waitFor(() => expect(guard.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());
  await expect(getWorkoutDetail(existing.id)).resolves.toBeNull();
  await expect(getActiveWorkout()).resolves.toMatchObject({ name: 'Guarded Routine' });
});
