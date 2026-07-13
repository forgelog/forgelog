import { getDb } from '../index';
import {
  replaceRecordStateForExerciseInDb,
  type ReplacedRecordState,
} from '../personalRecordState';
import type { PersonalRecord, PersonalRecordEvent } from '../types';

export async function getRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const db = await getDb();
  return db.getAllAsync<PersonalRecord>(
    'SELECT * FROM personal_records WHERE exercise_id = $id ORDER BY record_type',
    { $id: exerciseId }
  );
}

export async function getRecordEventsForExercise(
  exerciseId: string
): Promise<PersonalRecordEvent[]> {
  const db = await getDb();
  return db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE exercise_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: exerciseId }
  );
}

export async function getRecordEventsForWorkout(workoutId: string): Promise<PersonalRecordEvent[]> {
  const db = await getDb();
  return db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE workout_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: workoutId }
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

export async function replaceRecordStateForExercise(
  exerciseId: string
): Promise<ReplacedRecordState> {
  const db = await getDb();
  return replaceRecordStateForExerciseInDb(db, exerciseId);
}

export async function replaceRecordsForExercise(exerciseId: string): Promise<PersonalRecord[]> {
  const state = await replaceRecordStateForExercise(exerciseId);
  return state.currentRecords;
}
