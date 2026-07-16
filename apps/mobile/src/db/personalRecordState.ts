import {
  computeRecordState,
  type ComputedRecord,
  type ComputedRecordEvent,
  type ExerciseOccurrence,
  type RecordSet,
} from '../domain/personalRecords';
import { requireExerciseType } from '../domain/setFields';
import type { DatabaseExecutor } from './executor';
import { id } from './id';
import type { PersonalRecord, PersonalRecordEvent, RecordType, SetType } from './types';

type RecordSourceRow = {
  workout_exercise_id: string;
  workout_id: string;
  exercise_id: string;
  exercise_type: string;
  workout_started_at: string;
  workout_bodyweight_kg: number | null;
  workout_exercise_position: number;
  set_id: string;
  set_position: number;
  set_type: SetType;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  completed_at: string | null;
};

export type ReplacedRecordState = {
  currentRecords: PersonalRecord[];
  events: PersonalRecordEvent[];
};

// Recomputes the current record cache and the historical PR events for one
// exercise from completed sets. Must run inside the caller's transaction when
// composed with set/workout mutations. Returns the rows it wrote.
export async function replaceRecordStateForExerciseInDb(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<ReplacedRecordState> {
  const fallback = new Date().toISOString();
  // todo: audit pending
  const rows = await db.getAllAsync<RecordSourceRow>(
    `SELECT
       we.id AS workout_exercise_id,
       we.workout_id,
       we.exercise_id,
       we.exercise_type,
       w.started_at AS workout_started_at,
       w.bodyweight_kg AS workout_bodyweight_kg,
       we.position AS workout_exercise_position,
       ls.id AS set_id,
       ls.position AS set_position,
       ls.set_type,
       ls.weight,
       ls.reps,
       ls.duration_seconds,
       ls.distance_meters,
       ls.completed_at
     FROM logged_sets ls
     JOIN workout_exercises we ON we.id = ls.workout_exercise_id
     JOIN workouts w ON w.id = we.workout_id
    WHERE we.exercise_id = $id AND ls.completed = 1
    ORDER BY w.started_at, we.position, we.id, ls.position`,
    { $id: exerciseId }
  );
  // todo: audit pending
  const bodyweight = await db.getFirstAsync<{ bodyweight_kg: number | null }>(
    'SELECT bodyweight_kg FROM profile WHERE id = 0'
  );

  const state = computeRecordState(groupRows(rows), {
    bodyweightKg: bodyweight?.bodyweight_kg ?? null,
    fallbackAchievedAt: fallback,
  });

  // todo: audit pending
  const existingRecords = await db.getAllAsync<{ id: string; record_type: RecordType }>(
    'SELECT id, record_type FROM personal_records WHERE exercise_id = $id',
    { $id: exerciseId }
  );
  const existingIds = new Map(existingRecords.map((record) => [record.record_type, record.id]));

  // todo: audit pending
  await db.runAsync('DELETE FROM personal_records WHERE exercise_id = $id', { $id: exerciseId });
  // todo: audit pending
  await db.runAsync('DELETE FROM personal_record_events WHERE exercise_id = $id', {
    $id: exerciseId,
  });

  const currentRecords: PersonalRecord[] = [];
  for (const record of state.currentRecords) {
    const inserted = await insertCurrentRecord(db, exerciseId, record, existingIds);
    currentRecords.push(inserted);
  }

  const events: PersonalRecordEvent[] = [];
  const createdAt = new Date().toISOString();
  for (const event of state.events) {
    const inserted = await insertEvent(db, event, createdAt);
    events.push(inserted);
  }

  return { currentRecords, events };
}

export async function backfillPersonalRecordState(db: DatabaseExecutor): Promise<void> {
  // todo: audit pending
  const exercises = await db.getAllAsync<{ exercise_id: string }>(
    `SELECT DISTINCT we.exercise_id
       FROM workout_exercises we
       JOIN logged_sets ls ON ls.workout_exercise_id = we.id
      WHERE ls.completed = 1`
  );

  for (const exercise of exercises) {
    await replaceRecordStateForExerciseInDb(db, exercise.exercise_id);
  }
}

function groupRows(rows: RecordSourceRow[]): ExerciseOccurrence[] {
  const occurrences = new Map<string, ExerciseOccurrence>();
  for (const row of rows) {
    let occurrence = occurrences.get(row.workout_exercise_id);
    if (!occurrence) {
      occurrence = {
        id: row.workout_exercise_id,
        workoutId: row.workout_id,
        exerciseId: row.exercise_id,
      exerciseType: requireExerciseType(row.exercise_type),
      startedAt: row.workout_started_at,
      position: row.workout_exercise_position,
      bodyweightKg: row.workout_bodyweight_kg,
      sets: [],
      };
      occurrences.set(row.workout_exercise_id, occurrence);
    }
    occurrence.sets.push(mapRecordSet(row));
  }
  return [...occurrences.values()];
}

function mapRecordSet(row: RecordSourceRow): RecordSet {
  return {
    id: row.set_id,
    position: row.set_position,
    setType: row.set_type,
    weight: row.weight,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    completedAt: row.completed_at,
  };
}

async function insertCurrentRecord(
  db: DatabaseExecutor,
  exerciseId: string,
  record: ComputedRecord,
  existingIds: Map<RecordType, string>
): Promise<PersonalRecord> {
  const recordId = existingIds.get(record.type) ?? id();
  // todo: audit pending
  await db.runAsync(
    `INSERT INTO personal_records (id, exercise_id, record_type, value, logged_set_id, achieved_at)
     VALUES ($id, $exercise_id, $record_type, $value, $logged_set_id, $achieved_at)`,
    {
      $id: recordId,
      $exercise_id: exerciseId,
      $record_type: record.type,
      $value: record.value,
      $logged_set_id: record.loggedSetId,
      $achieved_at: record.achievedAt,
    }
  );
  return {
    id: recordId,
    exercise_id: exerciseId,
    record_type: record.type,
    value: record.value,
    logged_set_id: record.loggedSetId,
    achieved_at: record.achievedAt,
  };
}

async function insertEvent(
  db: DatabaseExecutor,
  event: ComputedRecordEvent,
  createdAt: string
): Promise<PersonalRecordEvent> {
  const eventId = `record_event:${event.workoutExerciseId}:${event.type}:${event.scope}`;
  // todo: audit pending
  await db.runAsync(
    `INSERT INTO personal_record_events
       (id, exercise_id, workout_id, workout_exercise_id, logged_set_id, record_type, scope, value, achieved_at, formula_version, created_at)
     VALUES
       ($id, $exercise_id, $workout_id, $workout_exercise_id, $logged_set_id, $record_type, $scope, $value, $achieved_at, $formula_version, $created_at)`,
    {
      $id: eventId,
      $exercise_id: event.exerciseId,
      $workout_id: event.workoutId,
      $workout_exercise_id: event.workoutExerciseId,
      $logged_set_id: event.loggedSetId,
      $record_type: event.type,
      $scope: event.scope,
      $value: event.value,
      $achieved_at: event.achievedAt,
      $formula_version: event.formulaVersion ?? null,
      $created_at: createdAt,
    }
  );
  return {
    id: eventId,
    exercise_id: event.exerciseId,
    workout_id: event.workoutId,
    workout_exercise_id: event.workoutExerciseId,
    logged_set_id: event.loggedSetId,
    record_type: event.type,
    scope: event.scope,
    value: event.value,
    achieved_at: event.achievedAt,
    formula_version: event.formulaVersion ?? null,
    created_at: createdAt,
  };
}
