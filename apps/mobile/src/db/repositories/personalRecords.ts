import { getDb } from '../index';
import { id } from '../id';
import { estimatedOneRepMax, SetPerformance } from '../records';
import type { PersonalRecord, RecordType } from '../types';

export async function getRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDb();
  return db.getAllAsync<PersonalRecord>(
    'SELECT * FROM personal_records WHERE exercise_id = $id ORDER BY record_type',
    { $id: exerciseId }
  );
}

export type ExerciseRecordRow = PersonalRecord & { exercise_name: string };

export async function listAllRecords(): Promise<ExerciseRecordRow[]> {
  const db = await getDb();
  return db.getAllAsync<ExerciseRecordRow>(
    `SELECT pr.*, e.name AS exercise_name
       FROM personal_records pr
       JOIN exercises e ON e.id = pr.exercise_id
      ORDER BY e.name COLLATE NOCASE, pr.record_type`
  );
}

type SetWithTiming = SetPerformance & { completed_at: string | null };
type ComputedRecord = { type: RecordType; value: number; achievedAt: string };

function computeRecordsWithTiming(sets: SetWithTiming[], fallback: string): ComputedRecord[] {
  const best: Partial<Record<RecordType, { value: number; achievedAt: string }>> = {};

  function update(type: RecordType, value: number, completedAt: string | null) {
    const at = completedAt ?? fallback;
    const existing = best[type];
    if (existing === undefined || value > existing.value) {
      best[type] = { value, achievedAt: at };
    } else if (value === existing.value && at < existing.achievedAt) {
      best[type] = { value, achievedAt: at };
    }
  }

  for (const s of sets) {
    if (s.weight != null) update('max_weight', s.weight, s.completed_at);
    if (s.reps != null) update('max_reps', s.reps, s.completed_at);
    if (s.weight != null && s.reps != null) {
      update('max_volume', s.weight * s.reps, s.completed_at);
      update('est_1rm', estimatedOneRepMax(s.weight, s.reps), s.completed_at);
    }
  }

  return (Object.entries(best) as [RecordType, { value: number; achievedAt: string }][]).map(
    ([type, { value, achievedAt }]) => ({ type, value, achievedAt })
  );
}

// Recomputes records for an exercise from all completed sets, deletes absent
// types, and inserts present ones. Must run inside the caller's transaction —
// does not open its own. Returns the records it wrote.
export async function replaceRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDb();
  const sets = await db.getAllAsync<SetWithTiming>(
    `SELECT ls.weight, ls.reps, ls.completed_at
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
      WHERE we.exercise_id = $id AND ls.completed = 1`,
    { $id: exerciseId }
  );

  const computed = computeRecordsWithTiming(sets, new Date().toISOString());

  await db.runAsync('DELETE FROM personal_records WHERE exercise_id = $id', { $id: exerciseId });

  const inserted: PersonalRecord[] = [];
  for (const rec of computed) {
    const newId = id();
    await db.runAsync(
      `INSERT INTO personal_records (id, exercise_id, record_type, value, achieved_at)
       VALUES ($id, $exercise_id, $record_type, $value, $achieved_at)`,
      {
        $id: newId,
        $exercise_id: exerciseId,
        $record_type: rec.type,
        $value: rec.value,
        $achieved_at: rec.achievedAt,
      }
    );
    inserted.push({
      id: newId,
      exercise_id: exerciseId,
      record_type: rec.type,
      value: rec.value,
      logged_set_id: null,
      achieved_at: rec.achievedAt,
    });
  }
  return inserted;
}
