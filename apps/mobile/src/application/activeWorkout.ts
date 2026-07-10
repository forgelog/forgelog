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
    await deleteLoggedSet(setId);
    await replaceRecordsForExercise(exerciseId);
  });
}

export async function discardWorkout(workoutId: string): Promise<void> {
  const db = await getDb();
  const detail = await getWorkoutDetail(workoutId);
  const exerciseIds = [...new Set((detail?.exercises ?? []).map((we) => we.exercise_id))];

  await db.withTransactionAsync(async () => {
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
