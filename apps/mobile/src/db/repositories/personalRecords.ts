import { getDb } from '../index';
import { id } from '../id';
import { estimatedOneRepMax, type RecordType, type SetPerformance } from '../../domain/records';
import type { PersonalRecord } from '../types';

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

type SetWithTiming = SetPerformance & { id: string; completed_at: string | null };
type ComputedRecord = { type: RecordType; value: number; achievedAt: string; loggedSetId: string };

function computeRecordsWithTiming(sets: SetWithTiming[], fallback: string): ComputedRecord[] {
  const best: Partial<Record<RecordType, { value: number; achievedAt: string; setId: string }>> = {};

  function update(type: RecordType, value: number, setId: string, completedAt: string | null) {
    const at = completedAt ?? fallback;
    const existing = best[type];
    if (existing === undefined || value > existing.value) {
      best[type] = { value, achievedAt: at, setId };
    } else if (value === existing.value && at < existing.achievedAt) {
      best[type] = { value, achievedAt: at, setId };
    }
  }

  for (const s of sets) {
    if (s.weight != null) update('max_weight', s.weight, s.id, s.completed_at);
    if (s.reps != null) update('max_reps', s.reps, s.id, s.completed_at);
    if (s.weight != null && s.reps != null) {
      update('max_volume', s.weight * s.reps, s.id, s.completed_at);
      update('est_1rm', estimatedOneRepMax(s.weight, s.reps), s.id, s.completed_at);
    }
  }

  return (
    Object.entries(best) as [RecordType, { value: number; achievedAt: string; setId: string }][]
  ).map(([type, { value, achievedAt, setId }]) => ({ type, value, achievedAt, loggedSetId: setId }));
}

// Recomputes records for an exercise from all completed sets, deletes absent
// types, and inserts present ones. Must run inside the caller's transaction —
// does not open its own. Returns the records it wrote.
export async function replaceRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDb();
  const sets = await db.getAllAsync<SetWithTiming>(
    `SELECT ls.id, ls.weight, ls.reps, ls.completed_at
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
      WHERE we.exercise_id = $id AND ls.completed = 1`,
    { $id: exerciseId }
  );

  const computed = computeRecordsWithTiming(sets, new Date().toISOString());
  const existingRecords = await db.getAllAsync<{ id: string; record_type: RecordType }>(
    'SELECT id, record_type FROM personal_records WHERE exercise_id = $id',
    { $id: exerciseId }
  );
  const existingIds = new Map(existingRecords.map((record) => [record.record_type, record.id]));

  await db.runAsync('DELETE FROM personal_records WHERE exercise_id = $id', { $id: exerciseId });

  const inserted: PersonalRecord[] = [];
  for (const rec of computed) {
    const recordId = existingIds.get(rec.type) ?? id();
    await db.runAsync(
      `INSERT INTO personal_records (id, exercise_id, record_type, value, logged_set_id, achieved_at)
       VALUES ($id, $exercise_id, $record_type, $value, $logged_set_id, $achieved_at)`,
      {
        $id: recordId,
        $exercise_id: exerciseId,
        $record_type: rec.type,
        $value: rec.value,
        $logged_set_id: rec.loggedSetId,
        $achieved_at: rec.achievedAt,
      }
    );
    inserted.push({
      id: recordId,
      exercise_id: exerciseId,
      record_type: rec.type,
      value: rec.value,
      logged_set_id: rec.loggedSetId,
      achieved_at: rec.achievedAt,
    });
  }
  return inserted;
}
