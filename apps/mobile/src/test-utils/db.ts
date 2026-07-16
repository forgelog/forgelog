import { getDb } from '../db/index';
import {
  mobileStore,
  runInMobileStoreTransaction,
  type TransactionBoundMobileStore,
} from '../db/mobileStore';
import type { Exercise } from '../db/types';

type TransactionOperation<Args extends unknown[], Result> = (
  ...args: Args
) => Promise<Result>;

function bindTransactionOperation<Args extends unknown[], Result>(
  select: (store: TransactionBoundMobileStore) => TransactionOperation<Args, Result>
): TransactionOperation<Args, Result> {
  return (...args) => runInMobileStoreTransaction((store) => select(store)(...args));
}

/** Test-fixture access to primitives intentionally omitted from the production facade. */
export const mobileStoreForTests = {
  ...mobileStore,
  workouts: {
    ...mobileStore.workouts,
    start: bindTransactionOperation((store) => store.workouts.start),
    getSetRecordContext: bindTransactionOperation(
      (store) => store.workouts.getSetRecordContext
    ),
    updateExercise: bindTransactionOperation((store) => store.workouts.updateExercise),
    removeExercise: bindTransactionOperation((store) => store.workouts.removeExercise),
    updateSet: bindTransactionOperation((store) => store.workouts.updateSet),
    removeSet: bindTransactionOperation((store) => store.workouts.removeSet),
    remove: bindTransactionOperation((store) => store.workouts.remove),
  },
  records: {
    ...mobileStore.records,
    getEventTypesForOccurrence: bindTransactionOperation(
      (store) => store.records.getEventTypesForOccurrence
    ),
    replaceForExercise: bindTransactionOperation((store) => store.records.replaceForExercise),
    replaceCurrentForExercise: bindTransactionOperation(
      (store) => store.records.replaceCurrentForExercise
    ),
    clearSetReference: bindTransactionOperation((store) => store.records.clearSetReference),
    clearSetReferencesForWorkoutExercise: bindTransactionOperation(
      (store) => store.records.clearSetReferencesForWorkoutExercise
    ),
    clearSetReferencesForWorkout: bindTransactionOperation(
      (store) => store.records.clearSetReferencesForWorkout
    ),
  },
} as const;

export async function seededExercise(name: string): Promise<Exercise> {
  const exercise = (await mobileStore.exercises.list({ search: name })).find(
    (candidate) => candidate.name === name
  );
  if (!exercise) throw new Error(`Missing seed exercise: ${name}`);
  return exercise;
}

export async function setWorkoutTimestamps(
  workoutId: string,
  startedAt: string,
  endedAt: string
): Promise<void> {
  const db = await getDb();
  // todo: audit pending
  await db.runAsync('UPDATE workouts SET started_at = $startedAt, ended_at = $endedAt WHERE id = $id', {
    $startedAt: startedAt,
    $endedAt: endedAt,
    $id: workoutId,
  });
}
