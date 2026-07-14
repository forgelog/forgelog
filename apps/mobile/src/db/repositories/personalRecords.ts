import type { DatabaseExecutor } from '../executor';
import {
  replaceRecordStateForExerciseInDb,
  type ReplacedRecordState,
} from '../personalRecordState';
import type { PersonalRecord, PersonalRecordEvent, RecordType } from '../types';

export async function getRecordsForExercise(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<PersonalRecord[]> {
  return db.getAllAsync<PersonalRecord>(
    'SELECT * FROM personal_records WHERE exercise_id = $id ORDER BY record_type',
    { $id: exerciseId }
  );
}

export async function getRecordEventsForExercise(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<PersonalRecordEvent[]> {
  return db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE exercise_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: exerciseId }
  );
}

export async function getRecordEventsForWorkout(
  db: DatabaseExecutor,
  workoutId: string
): Promise<PersonalRecordEvent[]> {
  return db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE workout_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: workoutId }
  );
}

export async function getRecordEventTypesForOccurrence(
  db: DatabaseExecutor,
  workoutExerciseId: string
): Promise<Set<RecordType>> {
  const events = await db.getAllAsync<{ record_type: RecordType }>(
    `SELECT record_type
       FROM personal_record_events
      WHERE workout_exercise_id = $id`,
    { $id: workoutExerciseId }
  );
  return new Set(events.map((event) => event.record_type));
}

export type ExerciseRecordRow = PersonalRecord & { exercise_name: string };

export async function listAllRecords(db: DatabaseExecutor): Promise<ExerciseRecordRow[]> {
  return db.getAllAsync<ExerciseRecordRow>(
    `SELECT pr.*, e.name AS exercise_name
       FROM personal_records pr
       JOIN exercises e ON e.id = pr.exercise_id
      ORDER BY e.name COLLATE NOCASE, pr.record_type`
  );
}

export async function replaceRecordStateForExercise(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<ReplacedRecordState> {
  return replaceRecordStateForExerciseInDb(db, exerciseId);
}

export async function replaceRecordsForExercise(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<PersonalRecord[]> {
  const state = await replaceRecordStateForExercise(db, exerciseId);
  return state.currentRecords;
}

export async function clearSetReference(db: DatabaseExecutor, loggedSetId: string): Promise<void> {
  await db.runAsync('UPDATE personal_records SET logged_set_id = NULL WHERE logged_set_id = $id', {
    $id: loggedSetId,
  });
}

export async function clearSetReferencesForWorkoutExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string
): Promise<void> {
  await db.runAsync(
    `UPDATE personal_records SET logged_set_id = NULL
     WHERE logged_set_id IN (
       SELECT id FROM logged_sets WHERE workout_exercise_id = $id
     )`,
    { $id: workoutExerciseId }
  );
}

export async function clearSetReferencesForWorkout(
  db: DatabaseExecutor,
  workoutId: string
): Promise<void> {
  await db.runAsync(
    `UPDATE personal_records SET logged_set_id = NULL
     WHERE logged_set_id IN (
       SELECT ls.id FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
       WHERE we.workout_id = $workoutId
     )`,
    { $workoutId: workoutId }
  );
}
