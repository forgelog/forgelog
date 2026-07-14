import { getDb } from '../db/index';
import { mobileStore } from '../db/mobileStore';
import type { Exercise } from '../db/types';

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
  await db.runAsync('UPDATE workouts SET started_at = $startedAt, ended_at = $endedAt WHERE id = $id', {
    $startedAt: startedAt,
    $endedAt: endedAt,
    $id: workoutId,
  });
}
