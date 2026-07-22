import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { deferred, latestAlertButtons } from '../../test-utils/async';
import { mobileStoreForTests as mobileStore, seededExercise } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';
import { HomeScreen } from '../HomeScreen';

jest.mock('@expo/ui/community/bottom-sheet');

const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  getDetail: getWorkoutDetail,
  start: startWorkout,
  setSetCompletion,
  updateSetValues: updateLoggedSetValues,
} = mobileStore.workouts;
const { getDetail: getRoutineDetail, saveDraft: saveRoutineDraft } = mobileStore.routines;

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

function renderActiveWorkout(
  workoutId: string,
  params: Partial<RootStackParamList['ActiveWorkout']> = {}
) {
  return renderWithStack<TestStackParamList>(
    [
      { name: 'Home', component: HomeScreen },
      { name: 'ActiveWorkout', component: ActiveWorkoutScreen },
      { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
      { name: 'ExerciseDetail', component: ExerciseDetailScreen },
    ],
    {
      index: 1,
      routes: [{ name: 'Home' }, { name: 'ActiveWorkout', params: { workoutId, ...params } }],
    }
  );
}

test('shows a missing-workout state', async () => {
  const missing = await renderActiveWorkout('missing-workout');

  await waitFor(() => expect(missing.getByText('Workout not found.')).toBeTruthy());
});

test('shows a load-error state', async () => {
  const db = await getDb();
  // todo: audit pending
  await db.execAsync('DROP TABLE workouts');

  const error = await renderActiveWorkout('broken-workout');

  await waitFor(() => expect(error.getByText('Could not load workout.')).toBeTruthy());
});

test('ignores stale reload responses after a newer reload wins', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Reload Race' });
  const stale = deferred<Awaited<ReturnType<typeof mobileStore.workouts.getDetail>>>();
  const realGetWorkoutDetail = mobileStore.workouts.getDetail;
  jest
    .spyOn(mobileStore.workouts, 'getDetail')
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
});

test('completes PR sets', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const baselineWorkout = await startWorkout({ name: 'Baseline Day' });
  const baselineExercise = await addExerciseToWorkout(baselineWorkout.id, bench.id);
  const baselineSet = await addSet(baselineExercise.id);
  await updateLoggedSetValues(baselineSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(baselineSet.id, true);
  await finishWorkout(baselineWorkout.id);
  const db = await getDb();
  // todo: audit pending
  await db.runAsync('UPDATE workouts SET started_at = $started WHERE id = $id', {
    $started: '2026-07-01T10:00:00.000Z',
    $id: baselineWorkout.id,
  });
  // todo: audit pending
  await db.runAsync('UPDATE logged_sets SET completed_at = $completed WHERE id = $id', {
    $completed: '2026-07-01T10:05:00.000Z',
    $id: baselineSet.id,
  });

  const workout = await startWorkout({ name: 'Active PR Day' });
  // todo: audit pending
  await db.runAsync('UPDATE workouts SET started_at = $started WHERE id = $id', {
    $started: '2026-07-08T10:00:00.000Z',
    $id: workout.id,
  });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  const active = await renderActiveWorkout(workout.id);
  await waitFor(() => expect(active.getByTestId('workout-set-0-0-complete')).toBeTruthy());
  await act(async () => {
    fireEvent.press(active.getByTestId('workout-set-0-0-complete'));
    await Promise.resolve();
  });

  await waitFor(() => expect(active.getByTestId('personal-record-toast')).toBeTruthy());
  expect(active.getByText('3 new personal records')).toBeTruthy();
  expect(alertSpy.mock.calls.some(([title]) => String(title).startsWith('New PR'))).toBe(false);
  await waitFor(async () => {
    const detail = await getWorkoutDetail(workout.id);
    expect(detail?.exercises[0].sets[0].completed).toBe(true);
  });
});

test('renders fields from the workout exercise snapshot', async () => {
  const trackingBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const trackingWorkout = await startWorkout({ name: 'Tracking Switch' });
  const trackingExercise = await addExerciseToWorkout(trackingWorkout.id, trackingBench.id);
  await addSet(trackingExercise.id);
  const tracking = await renderActiveWorkout(trackingWorkout.id);

  await waitFor(() =>
    expect(tracking.getByLabelText(`Workout set 1 weight for ${trackingBench.name}`)).toBeTruthy()
  );
  expect(tracking.getByTestId('workout-set-0-0-weight')).toBeTruthy();
  expect(tracking.getByTestId('workout-set-0-0-reps')).toBeTruthy();
  expect(tracking.queryByTestId('workout-exercise-0-tracking-type')).toBeNull();
});

test('persists the visible numeric values when completing a focused set', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Decimal Input' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  await addSet(workoutExercise.id);
  const active = await renderActiveWorkout(workout.id);

  const weightInput = await waitFor(() => active.getByTestId('workout-set-0-0-weight'));
  await act(async () => fireEvent(weightInput, 'focus'));
  await act(async () => fireEvent.changeText(weightInput, '3'));
  await act(async () => fireEvent.changeText(weightInput, '3.'));
  expect(weightInput.props.value).toBe('3.');
  await act(async () => fireEvent.changeText(weightInput, '3.5'));

  const repsInput = active.getByTestId('workout-set-0-0-reps');
  await act(async () => fireEvent(repsInput, 'focus'));
  await act(async () => fireEvent.changeText(repsInput, '4'));
  await act(async () => fireEvent.changeText(repsInput, '4.5'));
  expect(repsInput.props.value).toBe('4');

  await act(async () => {
    fireEvent.press(active.getByTestId('workout-set-0-0-complete'));
    await Promise.resolve();
  });

  await waitFor(async () => {
    const savedSet = (await getWorkoutDetail(workout.id))?.exercises[0].sets[0];
    expect(savedSet).toMatchObject({ weight: 3.5, reps: 4, completed: true });
  });
});

test('removes an exercise through its options menu', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Remove Exercise' });
  await addExerciseToWorkout(workout.id, bench.id);
  const removeFlow = await renderActiveWorkout(workout.id);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() =>
    expect(removeFlow.getByLabelText(`Exercise options ${bench.name}`)).toBeTruthy()
  );
  fireEvent.press(removeFlow.getByLabelText(`Exercise options ${bench.name}`));

  await waitFor(() =>
    expect(removeFlow.getByTestId('workout-exercise-options-sheet')).toBeTruthy()
  );
  fireEvent.press(removeFlow.getByLabelText(`Remove ${bench.name} from workout`));

  const removeButton = latestAlertButtons(alertSpy).find((button) => button.text === 'Remove');
  await removeButton?.onPress?.();

  await waitFor(() => expect(removeFlow.queryByText(bench.name)).toBeNull());
  await expect(getWorkoutDetail(workout.id)).resolves.toMatchObject({ exercises: [] });
  removeFlow.unmount();
});

test('finishes a workout', async () => {
  const finishBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const finishWorkoutRow = await startWorkout({ name: 'Finish Me' });
  const finishExercise = await addExerciseToWorkout(finishWorkoutRow.id, finishBench.id);
  const finishSet = await addSet(finishExercise.id);
  await updateLoggedSetValues(finishSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(finishSet.id, true);
  const finish = await renderActiveWorkout(finishWorkoutRow.id);

  await waitFor(() => expect(finish.getByText('Finish')).toBeTruthy());
  await act(async () => {
    fireEvent.press(finish.getByText('Finish'));
  });
  await waitFor(() => expect(finish.getByTestId('finish-workout-sheet')).toBeTruthy());
  await act(async () => {
    fireEvent.press(finish.getByTestId('finish-without-routine'));
  });
  await waitFor(async () =>
    expect((await getWorkoutDetail(finishWorkoutRow.id))?.ended_at).not.toBeNull()
  );
});

test('finishes a freestyle workout and saves its structure as a routine', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Workout' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  await updateLoggedSetValues(set.id, { weight: 105, reps: 6 });
  await setSetCompletion(set.id, true);
  const active = await renderActiveWorkout(workout.id);

  await waitFor(() => expect(active.getByText('Finish')).toBeTruthy());
  await act(async () => {
    fireEvent.press(active.getByText('Finish'));
  });
  await waitFor(() => expect(active.getByTestId('finish-workout-sheet')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(active.getByTestId('finish-routine-name'), 'Bench Day');
  });
  await waitFor(() =>
    expect(active.getByTestId('finish-save-routine').props.accessibilityState?.disabled).toBe(false)
  );
  await act(async () => {
    fireEvent.press(active.getByTestId('finish-save-routine'));
  });

  await waitFor(async () => expect((await getWorkoutDetail(workout.id))?.ended_at).not.toBeNull());
  const routines = await mobileStore.routines.list();
  expect(routines).toHaveLength(1);
  await expect(getRoutineDetail(routines[0].id)).resolves.toMatchObject({
    name: 'Bench Day',
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        sets: [expect.objectContaining({ target_weight: null, target_reps: null })],
      }),
    ],
  });
});

test('offers to update a routine when workout structure changed', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await saveRoutineDraft({
    name: 'Push Day',
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
  const workout = await startWorkout({ routineId: routine.id });
  const detail = await getWorkoutDetail(workout.id);
  const workoutExercise = detail?.exercises[0];
  const firstSet = workoutExercise?.sets[0];
  if (!workoutExercise || !firstSet) throw new Error('Expected routine snapshot');
  await setSetCompletion(firstSet.id, true);
  await addSet(workoutExercise.id, 'warmup');
  const active = await renderActiveWorkout(workout.id);

  await waitFor(() => expect(active.getByText('Finish')).toBeTruthy());
  await act(async () => {
    fireEvent.press(active.getByText('Finish'));
  });
  await waitFor(() => expect(active.getByText('Sets were added or removed')).toBeTruthy());
  await act(async () => {
    fireEvent.press(active.getByTestId('finish-update-routine'));
  });

  await waitFor(async () => expect((await getWorkoutDetail(workout.id))?.ended_at).not.toBeNull());
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    exercises: [
      expect.objectContaining({
        sets: [
          expect.objectContaining({ target_weight: 100, target_reps: 5 }),
          expect.objectContaining({ set_type: 'warmup', target_weight: null, target_reps: null }),
        ],
      }),
    ],
  });
});

test('discards a workout', async () => {
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
  const discardButton = latestAlertButtons(discardAlertSpy).find(
    (button) => button.text === 'Discard'
  );
  await act(async () => {
    await discardButton?.onPress?.();
  });
  await waitFor(async () => expect(await getWorkoutDetail(discardWorkoutRow.id)).toBeNull());
});
