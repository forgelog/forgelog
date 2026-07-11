import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import {
  addExerciseToWorkout,
  addSet,
  getWorkoutDetail,
  startWorkout,
  updateLoggedSet,
} from '../../db/repositories/workouts';
import * as workoutsRepository from '../../db/repositories/workouts';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { deferred, latestAlertButtons } from '../../test-utils/async';
import { seededExercise } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';
import { HomeScreen } from '../HomeScreen';

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

function renderActiveWorkout(workoutId: string, params: Partial<RootStackParamList['ActiveWorkout']> = {}) {
  return renderWithStack<TestStackParamList>(
    [
      { name: 'Home', component: HomeScreen },
      { name: 'ActiveWorkout', component: ActiveWorkoutScreen },
      { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
      { name: 'ExerciseDetail', component: ExerciseDetailScreen },
    ],
    {
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'ActiveWorkout', params: { workoutId, ...params } },
      ],
    }
  );
}

test('shows a missing-workout state', async () => {
  const missing = await renderActiveWorkout('missing-workout');

  await waitFor(() => expect(missing.getByText('Workout not found.')).toBeTruthy());
});

test('shows a load-error state', async () => {
  const db = await getDb();
  await db.execAsync('DROP TABLE workouts');

  const error = await renderActiveWorkout('broken-workout');

  await waitFor(() => expect(error.getByText('Could not load workout.')).toBeTruthy());
});

test('ignores stale reload responses after a newer reload wins', async () => {
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
});

test('completes PR sets', async () => {
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
});

test('switches tracking fields', async () => {
  const trackingBench = await seededExercise('Barbell Bench Press - Medium Grip');
  const trackingWorkout = await startWorkout({ name: 'Tracking Switch' });
  const trackingExercise = await addExerciseToWorkout(trackingWorkout.id, trackingBench.id);
  await addSet(trackingExercise.id);
  const tracking = await renderActiveWorkout(trackingWorkout.id);

  await waitFor(() =>
    expect(tracking.getByLabelText(`Workout tracking type for ${trackingBench.name}: Weight × reps`)).toBeTruthy()
  );
  await act(async () => {
    fireEvent.press(tracking.getByTestId('workout-exercise-0-tracking-type'));
  });
  await waitFor(() =>
    expect(tracking.getByLabelText(`Workout tracking type for ${trackingBench.name}: Reps`)).toBeTruthy()
  );
  expect(tracking.queryByTestId('workout-set-0-0-weight')).toBeNull();
  expect(tracking.getByTestId('workout-set-0-0-reps')).toBeTruthy();
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
  const finishButton = latestAlertButtons(finishAlertSpy).find((button) => button.text === 'Finish');
  await act(async () => {
    await finishButton?.onPress?.();
  });
  await waitFor(async () => expect((await getWorkoutDetail(finishWorkoutRow.id))?.ended_at).not.toBeNull());
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
  const discardButton = latestAlertButtons(discardAlertSpy).find((button) => button.text === 'Discard');
  await act(async () => {
    await discardButton?.onPress?.();
  });
  await waitFor(async () => expect(await getWorkoutDetail(discardWorkoutRow.id)).toBeNull());
});
