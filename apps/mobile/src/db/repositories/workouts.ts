import { getDb } from '../index';
import { id } from '../id';
import type {
  LoggedSet,
  SetType,
  Workout,
  WorkoutDetail,
  WorkoutExercise,
  WorkoutExerciseDetail,
} from '../types';
import { getRoutineDetail } from './routines';

type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  tracking_type: string | null;
  is_custom: number;
  instructions: string | null;
  images: string | null;
  secondary_muscles: string | null;
  created_at: string;
};

export async function startWorkout(options: {
  routineId?: string;
  name?: string;
} = {}): Promise<Workout> {
  const db = await getDb();
  const workoutId = id();
  const startedAt = new Date().toISOString();

  let name = options.name ?? 'Workout';
  if (options.routineId) {
    const routine = await getRoutineDetail(options.routineId);
    if (routine) name = options.name ?? routine.name;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workouts (id, routine_id, name, started_at)
       VALUES ($id, $routine_id, $name, $started_at)`,
      { $id: workoutId, $routine_id: options.routineId ?? null, $name: name, $started_at: startedAt }
    );

    if (options.routineId) {
      const routine = await getRoutineDetail(options.routineId);
      if (routine) {
        for (const re of routine.exercises) {
          const weId = id();
          await db.runAsync(
            `INSERT INTO workout_exercises
               (id, workout_id, exercise_id, position, superset_group_id, tracking_type, rest_seconds, notes)
             VALUES ($id, $workout_id, $exercise_id, $position, $superset_group_id, $tracking_type, $rest_seconds, $notes)`,
            {
              $id: weId,
              $workout_id: workoutId,
              $exercise_id: re.exercise_id,
              $position: re.position,
              $superset_group_id: re.superset_group_id,
              // snapshot the effective type so editing the routine/catalog later
              // never rewrites this logged workout.
              $tracking_type: re.tracking_type ?? re.exercise.tracking_type,
              $rest_seconds: re.rest_seconds,
              $notes: re.notes,
            }
          );
          for (const s of re.sets) {
            await db.runAsync(
              `INSERT INTO logged_sets
                 (id, workout_exercise_id, position, set_type, weight, reps, duration_seconds, distance_meters, completed)
               VALUES ($id, $we, $position, $set_type, $weight, $reps, $duration, $distance, 0)`,
              {
                $id: id(),
                $we: weId,
                $position: s.position,
                $set_type: s.set_type,
                $weight: s.target_weight,
                $reps: s.target_reps,
                $duration: s.target_duration_seconds,
                $distance: s.target_distance_meters,
              }
            );
          }
        }
      }
    }
  });

  const created = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = $id', {
    $id: workoutId,
  });
  if (!created) throw new Error('Failed to start workout');
  return created;
}

export async function getActiveWorkout(): Promise<Workout | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return row ?? null;
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const db = await getDb();
  const workout = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = $id', {
    $id: workoutId,
  });
  if (!workout) return null;

  const workoutExercises = await db.getAllAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE workout_id = $id ORDER BY position',
    { $id: workoutId }
  );

  const exercises: WorkoutExerciseDetail[] = [];
  for (const we of workoutExercises) {
    const exRow = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = $id', {
      $id: we.exercise_id,
    });
    const sets = await db.getAllAsync<RawLoggedSet>(
      'SELECT * FROM logged_sets WHERE workout_exercise_id = $id ORDER BY position',
      { $id: we.id }
    );
    if (!exRow) continue;
    exercises.push({
      ...we,
      exercise: {
        id: exRow.id,
        name: exRow.name,
        muscle_group: exRow.muscle_group,
        equipment: exRow.equipment,
        tracking_type: exRow.tracking_type,
        is_custom: exRow.is_custom === 1,
        instructions: exRow.instructions ? (JSON.parse(exRow.instructions) as string[]) : [],
        images: exRow.images ? (JSON.parse(exRow.images) as string[]) : [],
        secondary_muscles: exRow.secondary_muscles
          ? (JSON.parse(exRow.secondary_muscles) as string[])
          : [],
        created_at: exRow.created_at,
      },
      sets: sets.map(mapLoggedSet),
    });
  }

  return { ...workout, exercises };
}

// Sets from the most recent other completed workout that logged this
// exercise — used to show "PREV" reference values while actively logging.
export async function getPreviousSessionSets(
  exerciseId: string,
  excludeWorkoutId: string
): Promise<LoggedSet[]> {
  const db = await getDb();
  const we = await db.getFirstAsync<{ we_id: string }>(
    `SELECT we.id AS we_id
       FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = $exerciseId AND w.id != $excludeWorkoutId AND w.ended_at IS NOT NULL
      ORDER BY w.started_at DESC
      LIMIT 1`,
    { $exerciseId: exerciseId, $excludeWorkoutId: excludeWorkoutId }
  );
  if (!we) return [];
  const sets = await db.getAllAsync<RawLoggedSet>(
    'SELECT * FROM logged_sets WHERE workout_exercise_id = $id ORDER BY position',
    { $id: we.we_id }
  );
  return sets.map(mapLoggedSet);
}

export type ExerciseSession = {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  trackingType: string | null;
  sets: LoggedSet[];
};

// Past completed sessions that logged this exercise, most recent first —
// powers the exercise detail screen's History tab. A workout that logs the
// same exercise more than once (e.g. two separate blocks) folds into a
// single session with all of its sets combined.
export async function getSessionsForExercise(
  exerciseId: string,
  limit = 20
): Promise<ExerciseSession[]> {
  const db = await getDb();
  const workoutExercises = await db.getAllAsync<{
    we_id: string;
    workout_id: string;
    workout_name: string;
    started_at: string;
    tracking_type: string | null;
  }>(
    `SELECT we.id AS we_id, w.id AS workout_id, w.name AS workout_name, w.started_at, we.tracking_type
       FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = $id AND w.ended_at IS NOT NULL
      ORDER BY w.started_at DESC, we.position`,
    { $id: exerciseId }
  );

  const byWorkout = new Map<string, ExerciseSession>();
  for (const we of workoutExercises) {
    const sets = await db.getAllAsync<RawLoggedSet>(
      'SELECT * FROM logged_sets WHERE workout_exercise_id = $id ORDER BY position',
      { $id: we.we_id }
    );
    const existing = byWorkout.get(we.workout_id);
    if (existing) {
      existing.sets.push(...sets.map(mapLoggedSet));
    } else {
      byWorkout.set(we.workout_id, {
        workoutId: we.workout_id,
        workoutName: we.workout_name,
        startedAt: we.started_at,
        trackingType: we.tracking_type,
        sets: sets.map(mapLoggedSet),
      });
    }
  }
  return [...byWorkout.values()].slice(0, limit);
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string
): Promise<WorkoutExercise> {
  const db = await getDb();
  const newId = id();
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM workout_exercises WHERE workout_id = $id',
    { $id: workoutId }
  );
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position)
     VALUES ($id, $workout_id, $exercise_id, $position)`,
    { $id: newId, $workout_id: workoutId, $exercise_id: exerciseId, $position: row?.next ?? 0 }
  );
  const created = await db.getFirstAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE id = $id',
    { $id: newId }
  );
  if (!created) throw new Error('Failed to add exercise to workout');
  return created;
}

export async function updateWorkoutExercise(
  workoutExerciseId: string,
  fields: { superset_group_id?: string | null; tracking_type?: string | null; notes?: string | null }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: Record<string, string | null> = { $id: workoutExerciseId };
  if (fields.superset_group_id !== undefined) {
    sets.push('superset_group_id = $superset');
    params.$superset = fields.superset_group_id;
  }
  if (fields.tracking_type !== undefined) {
    sets.push('tracking_type = $tracking');
    params.$tracking = fields.tracking_type;
  }
  if (fields.notes !== undefined) {
    sets.push('notes = $notes');
    params.$notes = fields.notes;
  }
  if (!sets.length) return;
  await db.runAsync(`UPDATE workout_exercises SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function addSet(workoutExerciseId: string, setType: SetType = 'normal'): Promise<LoggedSet> {
  const db = await getDb();
  const newId = id();
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM logged_sets WHERE workout_exercise_id = $id',
    { $id: workoutExerciseId }
  );
  await db.runAsync(
    `INSERT INTO logged_sets (id, workout_exercise_id, position, set_type, completed)
     VALUES ($id, $we, $position, $set_type, 0)`,
    { $id: newId, $we: workoutExerciseId, $position: row?.next ?? 0, $set_type: setType }
  );
  const created = await db.getFirstAsync<RawLoggedSet>('SELECT * FROM logged_sets WHERE id = $id', {
    $id: newId,
  });
  if (!created) throw new Error('Failed to add set');
  return mapLoggedSet(created);
}

export type LoggedSetUpdate = {
  set_type?: SetType;
  weight?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  rpe?: number | null;
  completed?: boolean;
};

export async function updateLoggedSet(
  loggedSetId: string,
  fields: LoggedSetUpdate
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { $id: loggedSetId };

  const assign = (col: string, key: string, value: string | number | null) => {
    sets.push(`${col} = ${key}`);
    params[key] = value;
  };

  if (fields.set_type !== undefined) assign('set_type', '$set_type', fields.set_type);
  if (fields.weight !== undefined) assign('weight', '$weight', fields.weight);
  if (fields.reps !== undefined) assign('reps', '$reps', fields.reps);
  if (fields.duration_seconds !== undefined)
    assign('duration_seconds', '$duration', fields.duration_seconds);
  if (fields.distance_meters !== undefined)
    assign('distance_meters', '$distance', fields.distance_meters);
  if (fields.rpe !== undefined) assign('rpe', '$rpe', fields.rpe);
  if (fields.completed !== undefined) {
    assign('completed', '$completed', fields.completed ? 1 : 0);
    assign('completed_at', '$completed_at', fields.completed ? new Date().toISOString() : null);
  }

  if (!sets.length) return;
  await db.runAsync(`UPDATE logged_sets SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function deleteLoggedSet(loggedSetId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM logged_sets WHERE id = $id', { $id: loggedSetId });
}

export function hasCompletedSet(exercises: { sets: { completed: boolean }[] }[]): boolean {
  return exercises.some((we) => we.sets.some((s) => s.completed));
}

export async function finishWorkout(workoutId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET ended_at = $ended WHERE id = $id', {
    $ended: new Date().toISOString(),
    $id: workoutId,
  });
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: workoutId });
}

export async function listWorkouts(): Promise<Workout[]> {
  const db = await getDb();
  return db.getAllAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NOT NULL ORDER BY started_at DESC'
  );
}

export type ProfileStats = {
  workoutCount: number;
  totalVolume: number;
  streakDays: number;
};

export async function getProfileStats(): Promise<ProfileStats> {
  const db = await getDb();

  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workouts WHERE ended_at IS NOT NULL'
  );

  const volumeRow = await db.getFirstAsync<{ volume: number | null }>(
    `SELECT SUM(ls.weight * ls.reps) AS volume
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE ls.completed = 1 AND w.ended_at IS NOT NULL
        AND ls.weight IS NOT NULL AND ls.reps IS NOT NULL`
  );

  const dateRows = await db.getAllAsync<{ day: string }>(
    `SELECT DISTINCT date(started_at) AS day FROM workouts WHERE ended_at IS NOT NULL ORDER BY day DESC`
  );

  return {
    workoutCount: countRow?.count ?? 0,
    totalVolume: volumeRow?.volume ?? 0,
    streakDays: computeStreakDays(dateRows.map((r) => r.day)),
  };
}

export function computeStreakDays(sortedDescDays: string[]): number {
  if (sortedDescDays.length === 0) return 0;
  const days = new Set(sortedDescDays);
  let cursor = todayUtc();

  if (!days.has(toDateKey(cursor))) {
    cursor = addUtcDays(cursor, -1);
    if (!days.has(toDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }
  return streak;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + delta));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type RawLoggedSet = Omit<LoggedSet, 'completed'> & { completed: number };

function mapLoggedSet(row: RawLoggedSet): LoggedSet {
  return { ...row, completed: row.completed === 1 };
}
