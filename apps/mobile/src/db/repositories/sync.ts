import { getDb } from '../index';
import type { LoggedSet, PersonalRecord, RoutineDetail, SetType } from '../types';
import { listRoutines, getRoutineDetail } from './routines';
import { getRecordsForExercise, replaceRecordsForExercise } from './personalRecords';

// Everything the watch needs to log a workout offline: routine templates
// (with rest_seconds/tracking_type/superset info and their sets), the
// exercises they reference, and the current PR baseline for those exercises
// so the watch can detect a new PR without the phone being reachable.
export type SyncSnapshot = {
  routines: RoutineDetail[];
  personalRecords: PersonalRecord[];
};

export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  const routines = await listRoutines();
  const details: RoutineDetail[] = [];
  const exerciseIds = new Set<string>();

  for (const routine of routines) {
    const detail = await getRoutineDetail(routine.id);
    if (!detail) continue;
    details.push(detail);
    for (const re of detail.exercises) exerciseIds.add(re.exercise_id);
  }

  const personalRecords: PersonalRecord[] = [];
  for (const exerciseId of exerciseIds) {
    personalRecords.push(...(await getRecordsForExercise(exerciseId)));
  }

  return { routines: details, personalRecords };
}

// Shape of a workout logged on the watch, ready to upsert into the phone DB.
// IDs are already assigned (client-generated v4 UUIDs) on the watch, so
// upserts are idempotent — re-sending the same payload changes nothing.
export type WatchWorkoutPayload = {
  protocol_version: number;
  id: string;
  routine_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  exercises: WatchWorkoutExercisePayload[];
};

export type WatchWorkoutExercisePayload = {
  id: string;
  exercise_id: string;
  position: number;
  superset_group_id: string | null;
  tracking_type: string | null;
  rest_seconds: number | null;
  notes: string | null;
  sets: WatchLoggedSetPayload[];
};

export type WatchLoggedSetPayload = Omit<LoggedSet, 'set_type'> & { set_type: SetType };

export async function ingestWatchWorkout(payload: WatchWorkoutPayload): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workouts (id, routine_id, name, started_at, ended_at, notes)
       VALUES ($id, $routine_id, $name, $started_at, $ended_at, $notes)
       ON CONFLICT(id) DO UPDATE SET
         routine_id = excluded.routine_id,
         name = excluded.name,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         notes = excluded.notes`,
      {
        $id: payload.id,
        $routine_id: payload.routine_id,
        $name: payload.name,
        $started_at: payload.started_at,
        $ended_at: payload.ended_at,
        $notes: payload.notes,
      }
    );

    for (const we of payload.exercises) {
      await db.runAsync(
        `INSERT INTO workout_exercises
           (id, workout_id, exercise_id, position, superset_group_id, tracking_type, rest_seconds, notes)
         VALUES ($id, $workout_id, $exercise_id, $position, $superset_group_id, $tracking_type, $rest_seconds, $notes)
         ON CONFLICT(id) DO UPDATE SET
           exercise_id = excluded.exercise_id,
           position = excluded.position,
           superset_group_id = excluded.superset_group_id,
           tracking_type = excluded.tracking_type,
           rest_seconds = excluded.rest_seconds,
           notes = excluded.notes`,
        {
          $id: we.id,
          $workout_id: payload.id,
          $exercise_id: we.exercise_id,
          $position: we.position,
          $superset_group_id: we.superset_group_id,
          $tracking_type: we.tracking_type,
          $rest_seconds: we.rest_seconds,
          $notes: we.notes,
        }
      );

      for (const s of we.sets) {
        await db.runAsync(
          `INSERT INTO logged_sets
             (id, workout_exercise_id, position, set_type, weight, reps, duration_seconds, distance_meters, rpe, completed, completed_at)
           VALUES ($id, $we, $position, $set_type, $weight, $reps, $duration, $distance, $rpe, $completed, $completed_at)
           ON CONFLICT(id) DO UPDATE SET
             position = excluded.position,
             set_type = excluded.set_type,
             weight = excluded.weight,
             reps = excluded.reps,
             duration_seconds = excluded.duration_seconds,
             distance_meters = excluded.distance_meters,
             rpe = excluded.rpe,
             completed = excluded.completed,
             completed_at = excluded.completed_at`,
          {
            $id: s.id,
            $we: we.id,
            $position: s.position,
            $set_type: s.set_type,
            $weight: s.weight,
            $reps: s.reps,
            $duration: s.duration_seconds,
            $distance: s.distance_meters,
            $rpe: s.rpe,
            $completed: s.completed ? 1 : 0,
            $completed_at: s.completed_at,
          }
        );
      }
    }

    const touchedExerciseIds = new Set(payload.exercises.map((we) => we.exercise_id));
    for (const exerciseId of touchedExerciseIds) {
      await replaceRecordsForExercise(exerciseId);
    }
  });
}
