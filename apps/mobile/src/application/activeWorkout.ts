import { getDb } from '../db/index';
import { getRecordsForExercise, replaceRecordsForExercise } from '../db/repositories/personalRecords';
import {
  deleteLoggedSet,
  deleteWorkout,
  getActiveWorkout,
  getWorkoutDetail,
  startWorkout,
  updateLoggedSet,
} from '../db/repositories/workouts';
import type { PersonalRecord, Workout } from '../db/types';

export async function completeSet(
  setId: string,
  exerciseId: string
): Promise<{ improvedRecords: PersonalRecord[] }> {
  const db = await getDb();
  let improvedRecords: PersonalRecord[] = [];

  await db.withTransactionAsync(async () => {
    const before = await getRecordsForExercise(exerciseId);
    await updateLoggedSet(setId, { completed: true });
    const after = await replaceRecordsForExercise(exerciseId);
    const beforeMap = new Map(before.map((r) => [r.record_type, r.value]));
    improvedRecords = after.filter((r) => {
      const prev = beforeMap.get(r.record_type);
      return prev === undefined || r.value > prev;
    });
  });

  return { improvedRecords };
}

export async function uncompleteSet(setId: string, exerciseId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await updateLoggedSet(setId, { completed: false });
    await replaceRecordsForExercise(exerciseId);
  });
}

export async function deleteSet(setId: string, exerciseId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Nullify FK before deleting so personal_records doesn't block the delete
    await db.runAsync(
      'UPDATE personal_records SET logged_set_id = NULL WHERE logged_set_id = $id',
      { $id: setId }
    );
    await deleteLoggedSet(setId);
    await replaceRecordsForExercise(exerciseId);
  });
}

export async function discardWorkout(workoutId: string): Promise<void> {
  const db = await getDb();
  const detail = await getWorkoutDetail(workoutId);
  const exerciseIds = [...new Set((detail?.exercises ?? []).map((we) => we.exercise_id))];

  await db.withTransactionAsync(async () => {
    // Nullify FK refs from PRs to sets in this workout before cascade delete
    await db.runAsync(
      `UPDATE personal_records SET logged_set_id = NULL
       WHERE logged_set_id IN (
         SELECT ls.id FROM logged_sets ls
         JOIN workout_exercises we ON we.id = ls.workout_exercise_id
         WHERE we.workout_id = $workoutId
       )`,
      { $workoutId: workoutId }
    );
    await deleteWorkout(workoutId);
    for (const exerciseId of exerciseIds) {
      await replaceRecordsForExercise(exerciseId);
    }
  });
}

export async function startOrResumeWorkout(
  routineId?: string
): Promise<{ workout: Workout; resumed: boolean }> {
  const existing = await getActiveWorkout();
  if (existing) {
    return { workout: existing, resumed: true };
  }
  const workout = await startWorkout({ routineId });
  return { workout, resumed: false };
}
