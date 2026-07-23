import { requireExerciseType } from '../../domain/setFields';
import type { DatabaseExecutor } from '../executor';
import type { LoggedSet, PersonalRecord, RoutineDetail, SetType } from '../types';
import { listRoutines, getRoutineDetail } from './routines';
import { getRecordsForExercise, replaceRecordsForExercise } from './personalRecords';
import { getProfile, type Sex } from './profile';
import * as Crypto from 'expo-crypto';
import { getCanonicalState } from './activeWorkoutSync';
import { normalizedActiveWorkoutJson } from '../../sync/activeWorkoutProtocol';

export const SYNC_PROTOCOL_VERSION = 2;

export type SyncProfile = {
  name: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  bodyweight_kg: number | null;
};

// Everything the watch needs to log a workout offline: routine templates
// (with exercise_type/superset info and their sets), the
// exercises they reference, and the current PR baseline for those exercises
// so the watch can detect a new PR without the phone being reachable.
export type SyncSnapshot = {
  protocol_version: typeof SYNC_PROTOCOL_VERSION;
  routines: RoutineDetail[];
  personalRecords: PersonalRecord[];
  profile: SyncProfile;
};

export async function getSyncSnapshot(db: DatabaseExecutor): Promise<SyncSnapshot> {
  const routines = await listRoutines(db);
  const details: RoutineDetail[] = [];
  const exerciseIds = new Set<string>();

  for (const routine of routines) {
    const detail = await getRoutineDetail(db, routine.id);
    if (!detail) continue;
    details.push(detail);
    for (const re of detail.exercises) exerciseIds.add(re.exercise_id);
  }

  const personalRecords: PersonalRecord[] = [];
  for (const exerciseId of exerciseIds) {
    personalRecords.push(...(await getRecordsForExercise(db, exerciseId)));
  }

  const profile = await getProfile(db);
  return {
    protocol_version: SYNC_PROTOCOL_VERSION,
    routines: details,
    personalRecords,
    profile: {
      name: profile.name,
      sex: profile.sex,
      birth_date: profile.birthDate,
      height_cm: profile.heightCm,
      bodyweight_kg: profile.bodyweightKg,
    },
  };
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
  active_sync?: {
    finish_operation_id: string;
    device_id: string;
    device_sequence: number;
    canonical_revision: number | null;
    provisional: boolean;
    payload_hash: string;
  };
};

export type WatchWorkoutExercisePayload = {
  id: string;
  exercise_id: string;
  position: number;
  superset_group_id: string | null;
  exercise_type: string;
  notes: string | null;
  sets: WatchLoggedSetPayload[];
};

export type WatchLoggedSetPayload = Omit<LoggedSet, 'set_type'> & { set_type: SetType };

export async function ingestWatchWorkout(
  db: DatabaseExecutor,
  payload: WatchWorkoutPayload
): Promise<void> {
  // todo: audit pending
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
    // todo: audit pending
    await db.runAsync(
      `INSERT INTO workout_exercises
           (id, workout_id, exercise_id, position, superset_group_id, exercise_type, notes)
         VALUES ($id, $workout_id, $exercise_id, $position, $superset_group_id, $exercise_type, $notes)
         ON CONFLICT(id) DO UPDATE SET
           exercise_id = excluded.exercise_id,
           position = excluded.position,
           superset_group_id = excluded.superset_group_id,
           exercise_type = excluded.exercise_type,
           notes = excluded.notes`,
      {
        $id: we.id,
        $workout_id: payload.id,
        $exercise_id: we.exercise_id,
        $position: we.position,
        $superset_group_id: we.superset_group_id,
        $exercise_type: requireExerciseType(we.exercise_type),
        $notes: we.notes,
      }
    );

    for (const s of we.sets) {
      // todo: audit pending
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
    await replaceRecordsForExercise(db, exerciseId);
  }
}

export async function verifyActiveWorkoutCheckpoint(
  db: DatabaseExecutor,
  payload: WatchWorkoutPayload
): Promise<'waiting' | 'acknowledged' | 'conflict'> {
  const metadata = payload.active_sync;
  if (!metadata) throw new Error('Active sync metadata required');
  if (metadata.provisional || metadata.canonical_revision == null) return 'waiting';
  const operation = await db.getFirstAsync<{ status: string; accepted_revision: number | null; result_json: string }>(
    `SELECT status, accepted_revision, result_json FROM active_workout_operations
      WHERE operation_id = $operationId AND device_id = $deviceId AND device_sequence = $sequence`,
    { $operationId: metadata.finish_operation_id, $deviceId: metadata.device_id, $sequence: metadata.device_sequence }
  );
  if (!operation || !['accepted', 'resolved'].includes(operation.status)) return 'waiting';
  if (operation.accepted_revision !== metadata.canonical_revision) return 'conflict';

  const { active_sync: _metadata, ...completedPayload } = payload;
  const payloadJson = normalizedActiveWorkoutJson(completedPayload);
  const payloadHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payloadJson);
  if (payloadHash !== metadata.payload_hash) return 'conflict';

  const canonical = await getCanonicalState(db);
  const retainedResult = JSON.parse(operation.result_json) as { terminal_workout?: import('../../sync/activeWorkoutProtocol').ActiveWorkoutSnapshot };
  const workout = canonical.workout?.id === payload.id
    ? canonical.workout
    : retainedResult.terminal_workout ?? null;
  if (!workout || workout.id !== payload.id || canonical.revision < metadata.canonical_revision) {
    return 'waiting';
  }
  const expected: WatchWorkoutPayload = {
    protocol_version: SYNC_PROTOCOL_VERSION,
    id: workout.id,
    routine_id: workout.routine_id,
    name: workout.name,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    notes: workout.notes,
    exercises: workout.exercises.map((exercise) => ({
      id: exercise.id,
      exercise_id: exercise.exercise_id,
      position: exercise.position,
      superset_group_id: exercise.superset_group_id,
      exercise_type: exercise.exercise_type,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        workout_exercise_id: exercise.id,
        position: set.position,
        set_type: set.set_type as SetType,
        weight: set.weight,
        reps: set.reps,
        duration_seconds: set.duration_seconds,
        distance_meters: set.distance_meters,
        rpe: set.rpe,
        completed: set.completed,
        completed_at: set.completed_at,
      })),
    })),
  };
  return normalizedActiveWorkoutJson(expected) === payloadJson ? 'acknowledged' : 'conflict';
}
