import { getDb } from '../index';
import { id } from '../id';
import { computeRecords, SetPerformance } from '../records';
import type { PersonalRecord } from '../types';

export async function getRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDb();
  return db.getAllAsync<PersonalRecord>(
    'SELECT * FROM personal_records WHERE exercise_id = $id ORDER BY record_type',
    { $id: exerciseId }
  );
}

// Recomputes and upserts all record types for an exercise from its completed
// logged sets. Call after a set is marked completed.
export async function recalcRecordsForExercise(exerciseId: string): Promise<void> {
  const db = await getDb();
  const sets = await db.getAllAsync<SetPerformance>(
    `SELECT ls.weight, ls.reps
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
      WHERE we.exercise_id = $id AND ls.completed = 1`,
    { $id: exerciseId }
  );

  const records = computeRecords(sets);
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const [type, value] of Object.entries(records)) {
      await db.runAsync(
        `INSERT INTO personal_records (id, exercise_id, record_type, value, achieved_at)
         VALUES ($id, $exercise_id, $record_type, $value, $achieved_at)
         ON CONFLICT(exercise_id, record_type)
         DO UPDATE SET value = excluded.value, achieved_at = excluded.achieved_at`,
        {
          $id: id(),
          $exercise_id: exerciseId,
          $record_type: type,
          $value: value,
          $achieved_at: now,
        }
      );
    }
  });
}
