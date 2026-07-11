import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import { addExerciseToRoutine, addRoutineSet, createRoutine, updateRoutineExercise } from '../../db/repositories/routines';
import { getActiveWorkout, getWorkoutDetail, startWorkout } from '../../db/repositories/workouts';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { latestAlertButtons } from '../../test-utils/async';
import { seededExercise } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';
import { HomeScreen } from '../HomeScreen';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

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
  const routine = await createRoutine(name);
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await updateRoutineExercise(routineExercise.id, { tracking_type: 'weight_reps', rest_seconds: 90 });
  await addRoutineSet(routineExercise.id, { target_weight: 100, target_reps: 5 });
  return { bench, routine };
}

function renderHomeStack() {
  return renderWithStack<TestStackParamList>([
    { name: 'Home', component: HomeScreen },
    { name: 'ActiveWorkout', component: ActiveWorkoutScreen },
    { name: 'RoutineEditor', component: RoutineEditorScreen },
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
    { name: 'ExerciseDetail', component: ExerciseDetailScreen },
  ]);
}

test('shows empty routines', async () => {
  const home = await renderHomeStack();

  await waitFor(() => expect(home.getByText('No routines yet. Create one above.')).toBeTruthy());
});

test('shows a load-error state when routines fail to load', async () => {
  const db = await getDb();
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

test('starts a workout from a routine', async () => {
  await createRoutineWithBench('Routine Launch');
  const routineLaunch = await renderHomeStack();

  await waitFor(() => expect(routineLaunch.getByLabelText('Start routine Routine Launch')).toBeTruthy());
  fireEvent.press(routineLaunch.getByLabelText('Start routine Routine Launch'));
  await waitFor(() => expect(routineLaunch.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());
  expect(routineLaunch.getByTestId('workout-set-0-0-weight').props.value).toBe('100');
});

test('guards active-workout conflicts when starting a routine', async () => {
  await createRoutineWithBench('Guarded Routine');
  const existing = await startWorkout({ name: 'Already Active' });
  const guard = await renderHomeStack();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(guard.getByLabelText('Start routine Guarded Routine')).toBeTruthy());
  fireEvent.press(guard.getByLabelText('Start routine Guarded Routine'));
  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Workout in progress', expect.any(String), expect.any(Array))
  );

  const discardButton = latestAlertButtons(alertSpy).find((button) => button.text === 'Discard & start');
  await act(async () => {
    await discardButton?.onPress?.();
  });

  await waitFor(() => expect(guard.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());
  await expect(getWorkoutDetail(existing.id)).resolves.toBeNull();
  await expect(getActiveWorkout()).resolves.toMatchObject({ name: 'Guarded Routine' });
});
