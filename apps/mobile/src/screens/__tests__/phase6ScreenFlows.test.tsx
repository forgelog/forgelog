import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton, Text } from 'react-native';

import { currentWeekDays, monthLabel } from '../../domain/dates';
import { getDb, resetDbForTests } from '../../db/index';
import { getRecordsForExercise, replaceRecordsForExercise } from '../../db/repositories/personalRecords';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  updateRoutineExercise,
} from '../../db/repositories/routines';
import * as exercisesRepository from '../../db/repositories/exercises';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getActiveWorkout,
  getWorkoutDetail,
  startWorkout,
  updateLoggedSet,
} from '../../db/repositories/workouts';
import * as workoutsRepository from '../../db/repositories/workouts';
import type { Exercise } from '../../db/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';
import { HistoryScreen } from '../HistoryScreen';
import { HomeScreen } from '../HomeScreen';
import { RoutineEditorScreen } from '../RoutineEditorScreen';
import { WorkoutDetailScreen } from '../WorkoutDetailScreen';

type TestStackParamList = RootStackParamList & {
  Home: undefined;
  History: undefined;
  PickTarget: { pickedExerciseId?: string } | undefined;
};

const Stack = createNativeStackNavigator<TestStackParamList>();

function PickTargetScreen({ route }: { route: { params?: { pickedExerciseId?: string } } }) {
  return <Text>{route.params?.pickedExerciseId ? `Picked ${route.params.pickedExerciseId}` : 'No pick'}</Text>;
}

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

async function seededExercise(name: string): Promise<Exercise> {
  const exercise = (await exercisesRepository.listExercises({ search: name })).find(
    (candidate) => candidate.name === name
  );
  if (!exercise) throw new Error(`Missing seed exercise: ${name}`);
  return exercise;
}

async function setWorkoutTimestamps(workoutId: string, startedAt: string, endedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET started_at = $startedAt, ended_at = $endedAt WHERE id = $id', {
    $startedAt: startedAt,
    $endedAt: endedAt,
    $id: workoutId,
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function createRoutineWithBench(name = 'Phase Six Push') {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await createRoutine(name);
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await updateRoutineExercise(routineExercise.id, { tracking_type: 'weight_reps', rest_seconds: 90 });
  await addRoutineSet(routineExercise.id, { target_weight: 100, target_reps: 5 });
  return { bench, routine };
}

async function createFinishedBenchWorkout(name = 'Phase Six Push') {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSet(set.id, { weight: 100, reps: 5, completed: true });
  await finishWorkout(workout.id);
  await setWorkoutTimestamps(
    workout.id,
    '2026-07-11T09:00:00.000Z',
    '2026-07-11T10:05:00.000Z'
  );
  await replaceRecordsForExercise(bench.id);
  return { bench, workout, set };
}

async function renderHistoryStack() {
  return await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

async function renderHomeStack() {
  return await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

async function renderActiveWorkout(workoutId: string, params: Partial<RootStackParamList['ActiveWorkout']> = {}) {
  return await render(
    <NavigationContainer
      initialState={{
        index: 1,
        routes: [
          { name: 'Home' },
          { name: 'ActiveWorkout', params: { workoutId, ...params } },
        ],
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function latestAlertButtons(alertSpy: jest.SpyInstance): AlertButton[] {
  const call = alertSpy.mock.calls.at(-1);
  return (call?.[2] ?? []) as AlertButton[];
}

test('History shows the current week, empty state, month groups, and opens a workout detail', async () => {
  const todayDates = currentWeekDays(new Date()).map((day) => String(day.getDate()));
  const empty = await renderHistoryStack();

  await waitFor(() => expect(empty.getByText('No finished workouts yet.')).toBeTruthy());
  for (const day of todayDates) {
    expect(empty.getByText(day)).toBeTruthy();
  }
  empty.unmount();

  await createFinishedBenchWorkout('Phase Six Push');
  const { getByLabelText, getByText } = await renderHistoryStack();

  await waitFor(() => expect(getByText(monthLabel(new Date('2026-07-11T09:00:00.000Z')))).toBeTruthy());
  fireEvent.press(getByLabelText('Open workout Phase Six Push'));

  await waitFor(() => expect(getByText('100 kg × 5 reps')).toBeTruthy());
  expect(getByText('Done')).toBeTruthy();
});

test('History reports a repository load failure', async () => {
  const db = await getDb();
  await db.execAsync('DROP TABLE workouts');

  const { getByText } = await renderHistoryStack();

  await waitFor(() => expect(getByText('Could not load workout history.')).toBeTruthy());
});

test('Exercise library covers loading, empty, and load-error states', async () => {
  jest
    .spyOn(exercisesRepository, 'listExercises')
    .mockReturnValue(new Promise<Exercise[]>(() => {}));
  const loading = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  expect(loading.getByLabelText('Loading exercises')).toBeTruthy();
  await act(async () => {
    loading.unmount();
  });
  jest.restoreAllMocks();

  const library = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(library.getByText(/\d+ exercises/)).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(library.getByTestId('exercise-search-input'), 'phase-six-no-match');
  });
  await waitFor(() => expect(library.getByText('No exercises match your filters.')).toBeTruthy());
  await act(async () => {
    library.unmount();
  });

  resetDbForTests();
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const db = await getDb();
  await db.runAsync('UPDATE exercises SET images = $images WHERE id = $id', {
    $images: 'not-json',
    $id: bench.id,
  });

  const error = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(error.getByText('Could not load exercises.')).toBeTruthy());
  await act(async () => {
    error.unmount();
  });
});

test('Exercise library searches, filters, opens detail in browse mode, and returns a pick to the previous route', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');

  const browse = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(browse.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Muscle group filter'));
  });
  await waitFor(() => expect(browse.getByLabelText('Select Muscle group chest')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Select Muscle group chest'));
  });
  await waitFor(() => expect(browse.queryByLabelText('Select Muscle group chest')).toBeNull());
  await waitFor(() => expect(browse.getByText('84 exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Muscle group filter'));
  });
  await waitFor(() => expect(browse.getByLabelText('Select Muscle group chest')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Select Muscle group chest'));
  });
  await waitFor(() => expect(browse.getByText('84 exercises')).toBeTruthy());
  expect(browse.queryByLabelText('Loading exercises')).toBeNull();
  await act(async () => {
    fireEvent.changeText(browse.getByTestId('exercise-search-input'), 'bench');
  });

  await waitFor(() => expect(browse.getByText('18 exercises')).toBeTruthy());
  await waitFor(() => expect(browse.getByLabelText(`Open ${bench.name}`)).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText(`Open ${bench.name}`));
  });
  await waitFor(() => expect(browse.getByText('MUSCLES WORKED')).toBeTruthy());
  await act(async () => {
    browse.unmount();
  });

  const equipmentFilter = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(equipmentFilter.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(equipmentFilter.getByLabelText('Equipment filter'));
  });
  await waitFor(() => expect(equipmentFilter.getByLabelText('Select Equipment barbell')).toBeTruthy());
  await act(async () => {
    equipmentFilter.unmount();
  });

  const pick = await render(
    <NavigationContainer
      initialState={{
        index: 1,
        routes: [
          { name: 'RoutineEditor' },
          { name: 'ExerciseLibrary', params: { mode: 'pick', returnTo: 'RoutineEditor' } },
        ],
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="PickTarget" component={PickTargetScreen} />
        <Stack.Screen name="RoutineEditor" component={PickTargetScreen as any} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(pick.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(pick.getByTestId('exercise-search-input'), 'Push-Up Wide');
  });
  await waitFor(() => expect(pick.getByLabelText('Select Push-Up Wide')).toBeTruthy());
  await act(async () => {
    fireEvent.press(pick.getByLabelText('Select Push-Up Wide'));
  });
  await waitFor(() => expect(pick.getByText(/Picked /)).toBeTruthy());
  await act(async () => {
    pick.unmount();
  });
});

test('Exercise detail covers about, empty history, logged history, and PR badges', async () => {
  const { bench } = await createFinishedBenchWorkout('Bench PR Day');
  const records = await getRecordsForExercise(bench.id);
  expect(records.find((record) => record.record_type === 'max_weight')?.value).toBe(100);

  const detail = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          initialParams={{ exerciseId: bench.id }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
  const { getByLabelText, getByText } = detail;

  await waitFor(() => expect(getByText('MUSCLES WORKED')).toBeTruthy());
  expect(getByText('Primary')).toBeTruthy();
  expect(getByText('Equipment')).toBeTruthy();

  fireEvent.press(getByLabelText('History tab'));
  await waitFor(() => expect(getByText('Bench PR Day')).toBeTruthy());
  expect(getByText('100 kg × 5 reps')).toBeTruthy();
  expect(detail.getAllByText(/PR/).length).toBeGreaterThan(0);
  detail.unmount();

  const squat = await seededExercise('Barbell Squat');
  const empty = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          initialParams={{ exerciseId: squat.id }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
  await waitFor(() => expect(empty.getByText('MUSCLES WORKED')).toBeTruthy());
  fireEvent.press(empty.getByLabelText('History tab'));
  await waitFor(() => expect(empty.getByText('No sessions logged yet.')).toBeTruthy());
  empty.unmount();
});

test('Exercise detail keeps the about tab available when history loading fails', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const db = await getDb();
  await db.execAsync('DROP TABLE personal_records');

  const detail = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          initialParams={{ exerciseId: bench.id }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(detail.getByText('MUSCLES WORKED')).toBeTruthy());
  fireEvent.press(detail.getByLabelText('History tab'));
  await waitFor(() => expect(detail.getByText('Could not load exercise history.')).toBeTruthy());
  detail.unmount();
});

test('Exercise detail shows a missing-exercise state', async () => {
  const missing = await render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          initialParams={{ exerciseId: 'missing-exercise' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(missing.getByText('Exercise not found.')).toBeTruthy());
  missing.unmount();
});

test('Home shows empty routines and load-error states', async () => {
  const home = await renderHomeStack();
  await waitFor(() => expect(home.getByText('No routines yet. Create one above.')).toBeTruthy());
  home.unmount();

  resetDbForTests();
  const db = await getDb();
  await db.execAsync('DROP TABLE routines');

  const error = await renderHomeStack();

  await waitFor(() => expect(error.getByText('Could not load routines.')).toBeTruthy());
  error.unmount();
});

test('Home starts empty workouts, starts from routines, and guards active-workout conflicts', async () => {
  await createRoutineWithBench('Routine Launch');
  const { getByLabelText, getByText, unmount } = await renderHomeStack();

  await waitFor(() => expect(getByLabelText('Start Empty Workout')).toBeTruthy());
  fireEvent.press(getByLabelText('Start Empty Workout'));
  await waitFor(() => expect(getByText('Add Exercise')).toBeTruthy());
  unmount();

  resetDbForTests();
  await createRoutineWithBench('Routine Launch');
  const routineLaunch = await renderHomeStack();
  await waitFor(() => expect(routineLaunch.getByLabelText('Start routine Routine Launch')).toBeTruthy());
  fireEvent.press(routineLaunch.getByLabelText('Start routine Routine Launch'));
  await waitFor(() => expect(routineLaunch.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());
  expect(routineLaunch.getByTestId('workout-set-0-0-weight').props.value).toBe('100');
  routineLaunch.unmount();

  resetDbForTests();
  await createRoutineWithBench('Guarded Routine');
  const existing = await startWorkout({ name: 'Already Active' });
  const guard = await renderHomeStack();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(guard.getByLabelText('Start routine Guarded Routine')).toBeTruthy());
  fireEvent.press(guard.getByLabelText('Start routine Guarded Routine'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
    'Workout in progress',
    expect.any(String),
    expect.any(Array)
  ));

  const discardButton = latestAlertButtons(alertSpy).find((button) => button.text === 'Discard & start');
  await act(async () => {
    await discardButton?.onPress?.();
  });

  await waitFor(() => expect(guard.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());
  await expect(getWorkoutDetail(existing.id)).resolves.toBeNull();
  await expect(getActiveWorkout()).resolves.toMatchObject({ name: 'Guarded Routine' });
  guard.unmount();
});

test('Active workout shows missing and load-error states', async () => {
  const missing = await renderActiveWorkout('missing-workout');
  await waitFor(() => expect(missing.getByText('Workout not found.')).toBeTruthy());
  await act(async () => {
    missing.unmount();
  });

  resetDbForTests();
  const db = await getDb();
  await db.execAsync('DROP TABLE workouts');
  const error = await renderActiveWorkout('broken-workout');
  await waitFor(() => expect(error.getByText('Could not load workout.')).toBeTruthy());
  await act(async () => {
    error.unmount();
  });
});

test('Active workout ignores stale reload responses after a newer reload wins', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Reload Race' });
  const stale = deferred<Awaited<ReturnType<typeof workoutsRepository.getWorkoutDetail>>>();
  const realGetWorkoutDetail = workoutsRepository.getWorkoutDetail;
  jest
    .spyOn(workoutsRepository, 'getWorkoutDetail')
    .mockReturnValueOnce(stale.promise)
    .mockImplementation((id) => realGetWorkoutDetail(id));

  const active = await renderActiveWorkout(workout.id, { pickedExerciseId: bench.id });

  await waitFor(() => expect(active.getByText(bench.name)).toBeTruthy());
  await act(async () => {
    stale.resolve(null);
    await stale.promise;
  });

  expect(active.queryByText('Workout not found.')).toBeNull();
  expect(active.getByText(bench.name)).toBeTruthy();
  active.unmount();
});

test('Active workout completes PR sets, switches tracking fields, finishes, and discards', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Active PR Day' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSet(set.id, { weight: 105, reps: 3 });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  const active = await renderActiveWorkout(workout.id);
  await waitFor(() => expect(active.getByTestId('workout-set-0-0-complete')).toBeTruthy());
  await act(async () => {
    fireEvent.press(active.getByTestId('workout-set-0-0-complete'));
    await Promise.resolve();
  });

  await waitFor(() => expect(alertSpy.mock.calls.some(([title]) => String(title).startsWith('New PR'))).toBe(true));
  await waitFor(async () => {
    const detail = await getWorkoutDetail(workout.id);
    expect(detail?.exercises[0].sets[0].completed).toBe(true);
  });
  await act(async () => {
    active.unmount();
  });

  resetDbForTests();
  const trackingBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const trackingWorkout = await startWorkout({ name: 'Tracking Switch' });
  const trackingExercise = await addExerciseToWorkout(trackingWorkout.id, trackingBench.id);
  await addSet(trackingExercise.id);
  const tracking = await renderActiveWorkout(trackingWorkout.id);

  await waitFor(() => expect(tracking.getByLabelText(`Workout tracking type for ${trackingBench.name}: Weight × reps`)).toBeTruthy());
  await act(async () => {
    fireEvent.press(tracking.getByTestId('workout-exercise-0-tracking-type'));
  });
  await waitFor(() => expect(tracking.getByLabelText(`Workout tracking type for ${trackingBench.name}: Reps`)).toBeTruthy());
  expect(tracking.queryByTestId('workout-set-0-0-weight')).toBeNull();
  expect(tracking.getByTestId('workout-set-0-0-reps')).toBeTruthy();
  await act(async () => {
    tracking.unmount();
  });

  resetDbForTests();
  const finishBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const finishWorkoutRow = await startWorkout({ name: 'Finish Me' });
  const finishExercise = await addExerciseToWorkout(finishWorkoutRow.id, finishBench.id);
  const finishSet = await addSet(finishExercise.id);
  await updateLoggedSet(finishSet.id, { weight: 100, reps: 5, completed: true });
  const finish = await renderActiveWorkout(finishWorkoutRow.id);
  const finishAlertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(finish.getByText('Finish')).toBeTruthy());
  await act(async () => {
    fireEvent.press(finish.getByText('Finish'));
  });
  const finishButton = latestAlertButtons(finishAlertSpy).find((button) => button.text === 'Finish');
  await act(async () => {
    await finishButton?.onPress?.();
  });
  await waitFor(async () => expect((await getWorkoutDetail(finishWorkoutRow.id))?.ended_at).not.toBeNull());
  await act(async () => {
    finish.unmount();
  });

  resetDbForTests();
  const discardBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const discardWorkoutRow = await startWorkout({ name: 'Discard Me' });
  const discardExercise = await addExerciseToWorkout(discardWorkoutRow.id, discardBench.id);
  await addSet(discardExercise.id);
  const discard = await renderActiveWorkout(discardWorkoutRow.id);
  const discardAlertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(discard.getByLabelText('Discard workout')).toBeTruthy());
  await act(async () => {
    fireEvent.press(discard.getByLabelText('Discard workout'));
  });
  const discardButton = latestAlertButtons(discardAlertSpy).find((button) => button.text === 'Discard');
  await act(async () => {
    await discardButton?.onPress?.();
  });
  await waitFor(async () => expect(await getWorkoutDetail(discardWorkoutRow.id)).toBeNull());
  await act(async () => {
    discard.unmount();
  });
});
