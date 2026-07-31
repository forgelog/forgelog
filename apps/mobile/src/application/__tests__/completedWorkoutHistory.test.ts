import { getDb, resetDbForTests } from '../../db/index';
import { getRecordsForExercise } from '../../db/repositories/personalRecords';
import { applyWatchWorkoutMailbox } from '../../db/repositories/workoutReconciliation';
import {
  addExerciseToActiveReplica,
  addSetToActiveReplica,
  finishActiveWorkout,
  getDesiredPhoneMailbox,
  getWorkoutDetailFromReplica,
  listAuthoredWorkoutReplicas,
  setActiveSetCompletion,
  startActiveWorkoutReplica,
  updateActiveSetValues,
} from '../../db/repositories/workoutReplicas';
import { seededExercise } from '../../test-utils/db';
import {
  deleteCompletedWorkout,
  renameCompletedWorkout,
} from '../completedWorkoutHistory';

beforeEach(() => {
  resetDbForTests();
});

async function finishBenchWorkout(name: string, weight: number, startedAtMs: number) {
  const db = await getDb();
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startActiveWorkoutReplica(db, { name, nowMs: startedAtMs });
  const exercise = await addExerciseToActiveReplica(db, workout.id, bench.id, startedAtMs + 1);
  const set = await addSetToActiveReplica(db, exercise.id, 'normal', startedAtMs + 2);
  await updateActiveSetValues(db, set.id, { weight, reps: 5 }, startedAtMs + 3);
  await setActiveSetCompletion(db, set.id, true, startedAtMs + 4);
  const finished = await finishActiveWorkout(db, workout.id, startedAtMs + 100);
  return { bench, workout, finished };
}

test('a completed workout name edit survives replay of its finished sync snapshot', async () => {
  const db = await getDb();
  const { workout, finished } = await finishBenchWorkout('Original name', 100, 1000);

  await renameCompletedWorkout(workout.id, 'User-edited name');
  expect((await listAuthoredWorkoutReplicas(db))[0]?.replica).toEqual(finished);
  expect((await getDesiredPhoneMailbox(db)).candidate).toEqual(finished);
  await applyWatchWorkoutMailbox(
    db,
    { protocol_version: 1, candidate: finished, watch_receipt: null },
    1200
  );

  await expect(getWorkoutDetailFromReplica(db, workout.id)).resolves.toMatchObject({
    name: 'User-edited name',
  });
});

test('a completed workout deletion survives replay of its finished sync snapshot', async () => {
  const db = await getDb();
  const { workout, finished } = await finishBenchWorkout('Delete me', 100, 1000);

  await deleteCompletedWorkout(workout.id);
  expect((await listAuthoredWorkoutReplicas(db))[0]?.replica).toEqual(finished);
  expect((await getDesiredPhoneMailbox(db)).candidate).toEqual(finished);
  await applyWatchWorkoutMailbox(
    db,
    { protocol_version: 1, candidate: finished, watch_receipt: null },
    1200
  );

  await expect(getWorkoutDetailFromReplica(db, workout.id)).resolves.toBeNull();
  expect((await listAuthoredWorkoutReplicas(db))[0]?.replica).toEqual(finished);
});

test('deleting a completed workout recomputes personal records from remaining history', async () => {
  const first = await finishBenchWorkout('Baseline', 100, 1000);
  const second = await finishBenchWorkout('Later record', 120, 2000);

  expect(
    (await getRecordsForExercise(await getDb(), first.bench.id)).find(
      (record) => record.record_type === 'max_weight'
    )?.value
  ).toBe(120);

  await deleteCompletedWorkout(second.workout.id);

  expect(
    (await getRecordsForExercise(await getDb(), first.bench.id)).find(
      (record) => record.record_type === 'max_weight'
    )?.value
  ).toBe(100);
});
