import type { DatabaseExecutor } from '../executor';

export type CompletedWorkoutLocalState = {
  name_override: string | null;
  deleted: boolean;
};

type CompletedWorkoutLocalStateRow = Omit<CompletedWorkoutLocalState, 'deleted'> & {
  deleted: number;
};

export async function getCompletedWorkoutLocalState(
  db: DatabaseExecutor,
  workoutId: string
): Promise<CompletedWorkoutLocalState | null> {
  const row = await db.getFirstAsync<CompletedWorkoutLocalStateRow>(
    `SELECT name_override, deleted
       FROM completed_workout_local_state
      WHERE workout_id = $id`,
    { $id: workoutId }
  );
  return row ? { name_override: row.name_override, deleted: row.deleted === 1 } : null;
}

export async function saveCompletedWorkoutNameOverride(
  db: DatabaseExecutor,
  workoutId: string,
  name: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO completed_workout_local_state (workout_id, name_override, deleted)
     VALUES ($id, $name, 0)
     ON CONFLICT(workout_id) DO UPDATE SET name_override = excluded.name_override
     WHERE completed_workout_local_state.deleted = 0`,
    { $id: workoutId, $name: name }
  );
}

export async function saveCompletedWorkoutDeletion(
  db: DatabaseExecutor,
  workoutId: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO completed_workout_local_state (workout_id, name_override, deleted)
     VALUES ($id, NULL, 1)
     ON CONFLICT(workout_id) DO UPDATE SET name_override = NULL, deleted = 1`,
    { $id: workoutId }
  );
}
