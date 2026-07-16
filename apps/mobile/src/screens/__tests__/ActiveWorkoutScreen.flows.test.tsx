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
  updateSet: updateLoggedSet,
} = mobileStore.workouts;

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
  await updateLoggedSet(baselineSet.id, { weight: 100, reps: 5, completed: true });
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
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });
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

test('removes an exercise through its options menu', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Remove Exercise' });
  await addExerciseToWorkout(workout.id, bench.id);
  const removeFlow = await renderActiveWorkout(workout.id);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(removeFlow.getByLabelText(`Exercise options ${bench.name}`)).toBeTruthy());
  fireEvent.press(removeFlow.getByLabelText(`Exercise options ${bench.name}`));

  await waitFor(() => expect(removeFlow.getByTestId('workout-exercise-options-sheet')).toBeTruthy());
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
  await updateLoggedSet(finishSet.id, { weight: 100, reps: 5, completed: true });
  const finish = await renderActiveWorkout(finishWorkoutRow.id);
  const finishAlertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  await waitFor(() => expect(finish.getByText('Finish')).toBeTruthy());
  await act(async () => {
    fireEvent.press(finish.getByText('Finish'));
  });
  const finishButton = latestAlertButtons(finishAlertSpy).find(
    (button) => button.text === 'Finish'
  );
  await act(async () => {
    await finishButton?.onPress?.();
  });
  await waitFor(async () =>
    expect((await getWorkoutDetail(finishWorkoutRow.id))?.ended_at).not.toBeNull()
  );
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
