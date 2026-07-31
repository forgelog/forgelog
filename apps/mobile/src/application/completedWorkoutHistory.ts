import { runInMobileStoreTransaction } from '../db/mobileStore';
import type { WorkoutDetail } from '../db/types';

async function requireCompletedWorkout(
  workoutId: string,
  getDetail: (id: string) => Promise<WorkoutDetail | null>
): Promise<WorkoutDetail> {
  const workout = await getDetail(workoutId);
  if (!workout?.ended_at) throw new Error('Completed workout not found');
  return workout;
}

export async function renameCompletedWorkout(workoutId: string, name: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    await requireCompletedWorkout(workoutId, store.workouts.getDetail);
    await store.completedWorkoutHistory.saveNameOverride(workoutId, name);
    await store.workouts.updateName(workoutId, name);
  });
}

export async function deleteCompletedWorkout(workoutId: string): Promise<void> {
  await runInMobileStoreTransaction(async (store) => {
    const workout = await requireCompletedWorkout(workoutId, store.workouts.getDetail);
    const exerciseIds = [...new Set(workout.exercises.map((exercise) => exercise.exercise_id))];

    await store.completedWorkoutHistory.saveDeletion(workoutId);
    await store.records.clearSetReferencesForWorkout(workoutId);
    await store.workouts.remove(workoutId);
    for (const exerciseId of exerciseIds) {
      await store.records.replaceForExercise(exerciseId);
    }
  });
}
