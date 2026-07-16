import { computeStreakDays, localDateKey } from '../../domain/dates';
import { requireExerciseType } from '../../domain/setFields';
import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import type {
  LoggedSet,
  PersonalRecordEvent,
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
  exercise_type: string;
  is_custom: number;
  instructions: string | null;
  images: string | null;
  secondary_muscles: string | null;
  created_at: string;
};

export async function startWorkout(
  db: DatabaseExecutor,
  options: {
    routineId?: string;
    name?: string;
  } = {}
): Promise<Workout> {
  const workoutId = id();
  const startedAt = new Date().toISOString();

  let name = options.name ?? 'Workout';
  if (options.routineId) {
    const routine = await getRoutineDetail(db, options.routineId);
    if (routine) name = options.name ?? routine.name;
  }

  // todo: audit pending
  await db.runAsync(
    `INSERT INTO workouts (id, routine_id, name, started_at)
       VALUES ($id, $routine_id, $name, $started_at)`,
    { $id: workoutId, $routine_id: options.routineId ?? null, $name: name, $started_at: startedAt }
  );

  if (options.routineId) {
    const routine = await getRoutineDetail(db, options.routineId);
    if (routine) {
      for (const re of routine.exercises) {
        const weId = id();
        // todo: audit pending
        await db.runAsync(
          `INSERT INTO workout_exercises
               (id, workout_id, exercise_id, position, superset_group_id, exercise_type, notes)
             VALUES ($id, $workout_id, $exercise_id, $position, $superset_group_id, $exercise_type, $notes)`,
          {
            $id: weId,
            $workout_id: workoutId,
            $exercise_id: re.exercise_id,
            $position: re.position,
            $superset_group_id: re.superset_group_id,
            // Snapshot the routine exercise type so later routine/catalog edits
            // never rewrites this logged workout.
            $exercise_type: requireExerciseType(re.exercise_type),
            $notes: re.notes,
          }
        );
        for (const s of re.sets) {
          // todo: audit pending
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

  // todo: audit pending
  const created = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = $id', {
    $id: workoutId,
  });
  if (!created) throw new Error('Failed to start workout');
  return created;
}

export async function getActiveWorkout(db: DatabaseExecutor): Promise<Workout | null> {
  // todo: audit pending
  const row = await db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return row ?? null;
}

export async function getWorkoutDetail(
  db: DatabaseExecutor,
  workoutId: string
): Promise<WorkoutDetail | null> {
  // todo: audit pending
  const workout = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = $id', {
    $id: workoutId,
  });
  if (!workout) return null;

  // todo: audit pending
  const workoutExercises = await db.getAllAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE workout_id = $id ORDER BY position',
    { $id: workoutId }
  );

  const exercises: WorkoutExerciseDetail[] = [];
  for (const we of workoutExercises) {
    // todo: audit pending
    const exRow = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = $id', {
      $id: we.exercise_id,
    });
    // todo: audit pending
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
        exercise_type: requireExerciseType(exRow.exercise_type),
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
  db: DatabaseExecutor,
  exerciseId: string,
  excludeWorkoutId: string
): Promise<LoggedSet[]> {
  // todo: audit pending
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
  // todo: audit pending
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
  exerciseType: string;
  sets: LoggedSet[];
  recordEvents: PersonalRecordEvent[];
};

// Past completed sessions that logged this exercise, most recent first —
// powers the exercise detail screen's History tab. A workout that logs the
// same exercise more than once (e.g. two separate blocks) folds into a
// single session with all of its sets combined.
export async function getSessionsForExercise(
  db: DatabaseExecutor,
  exerciseId: string,
  limit = 20
): Promise<ExerciseSession[]> {
  // todo: audit pending
  const workoutExercises = await db.getAllAsync<{
    we_id: string;
    workout_id: string;
    workout_name: string;
    started_at: string;
    exercise_type: string;
  }>(
    `SELECT we.id AS we_id, w.id AS workout_id, w.name AS workout_name, w.started_at, we.exercise_type
       FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = $id AND w.ended_at IS NOT NULL
      ORDER BY w.started_at DESC, we.position`,
    { $id: exerciseId }
  );
  // todo: audit pending
  const recordEvents = await db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE exercise_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: exerciseId }
  );
  const eventsByWorkout = new Map<string, PersonalRecordEvent[]>();
  for (const event of recordEvents) {
    const events = eventsByWorkout.get(event.workout_id) ?? [];
    events.push(event);
    eventsByWorkout.set(event.workout_id, events);
  }

  const byWorkout = new Map<string, ExerciseSession>();
  for (const we of workoutExercises) {
    // todo: audit pending
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
        exerciseType: requireExerciseType(we.exercise_type),
        sets: sets.map(mapLoggedSet),
        recordEvents: eventsByWorkout.get(we.workout_id) ?? [],
      });
    }
  }
  return [...byWorkout.values()].slice(0, limit);
}

export async function addExerciseToWorkout(
  db: DatabaseExecutor,
  workoutId: string,
  exerciseId: string
): Promise<WorkoutExercise> {
  const newId = id();
  // todo: audit pending
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM workout_exercises WHERE workout_id = $id',
    { $id: workoutId }
  );
  // todo: audit pending
  const exercise = await db.getFirstAsync<{ exercise_type: string }>(
    'SELECT exercise_type FROM exercises WHERE id = $id',
    { $id: exerciseId }
  );
  if (!exercise) throw new Error('Exercise not found');
  // todo: audit pending
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, exercise_type)
     VALUES ($id, $workout_id, $exercise_id, $position, $exercise_type)`,
    {
      $id: newId,
      $workout_id: workoutId,
      $exercise_id: exerciseId,
      $position: row?.next ?? 0,
      $exercise_type: requireExerciseType(exercise.exercise_type),
    }
  );
  // todo: audit pending
  const created = await db.getFirstAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE id = $id',
    { $id: newId }
  );
  if (!created) throw new Error('Failed to add exercise to workout');
  return created;
}

export async function updateWorkoutExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  fields: { superset_group_id?: string | null; notes?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const params: Record<string, string | null> = { $id: workoutExerciseId };
  if (fields.superset_group_id !== undefined) {
    sets.push('superset_group_id = $superset');
    params.$superset = fields.superset_group_id;
  }
  if (fields.notes !== undefined) {
    sets.push('notes = $notes');
    params.$notes = fields.notes;
  }
  if (!sets.length) return;
  // todo: audit pending
  await db.runAsync(`UPDATE workout_exercises SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function addSet(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  setType: SetType = 'normal'
): Promise<LoggedSet> {
  const newId = id();
  // todo: audit pending
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM logged_sets WHERE workout_exercise_id = $id',
    { $id: workoutExerciseId }
  );
  // todo: audit pending
  await db.runAsync(
    `INSERT INTO logged_sets (id, workout_exercise_id, position, set_type, completed)
     VALUES ($id, $we, $position, $set_type, 0)`,
    { $id: newId, $we: workoutExerciseId, $position: row?.next ?? 0, $set_type: setType }
  );
  // todo: audit pending
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

export type LoggedSetRecordContext = {
  workout_exercise_id: string;
  completed: number;
};

export async function getLoggedSetRecordContext(
  db: DatabaseExecutor,
  loggedSetId: string
): Promise<LoggedSetRecordContext | null> {
  // todo: audit pending
  return db.getFirstAsync<LoggedSetRecordContext>(
    `SELECT workout_exercise_id, completed
       FROM logged_sets
      WHERE id = $id`,
    { $id: loggedSetId }
  );
}

export async function updateLoggedSet(
  db: DatabaseExecutor,
  loggedSetId: string,
  fields: LoggedSetUpdate
): Promise<void> {
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
  // todo: audit pending
  await db.runAsync(`UPDATE logged_sets SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function deleteLoggedSet(db: DatabaseExecutor, loggedSetId: string): Promise<void> {
  // todo: audit pending
  await db.runAsync('DELETE FROM logged_sets WHERE id = $id', { $id: loggedSetId });
}

export async function deleteWorkoutExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string
): Promise<void> {
  // todo: audit pending
  await db.runAsync('DELETE FROM workout_exercises WHERE id = $id', { $id: workoutExerciseId });
}

export function hasCompletedSet(exercises: { sets: { completed: boolean }[] }[]): boolean {
  return exercises.some((we) => we.sets.some((s) => s.completed));
}

export async function finishWorkout(db: DatabaseExecutor, workoutId: string): Promise<void> {
  // todo: audit pending
  await db.runAsync('UPDATE workouts SET ended_at = $ended WHERE id = $id', {
    $ended: new Date().toISOString(),
    $id: workoutId,
  });
}

export async function deleteWorkout(db: DatabaseExecutor, workoutId: string): Promise<void> {
  // todo: audit pending
  await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: workoutId });
}

export async function listWorkouts(db: DatabaseExecutor): Promise<Workout[]> {
  // todo: audit pending
  return db.getAllAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NOT NULL ORDER BY started_at DESC'
  );
}

export type ProfileStats = {
  workoutCount: number;
  totalVolume: number;
  streakDays: number;
};

export async function getProfileStats(db: DatabaseExecutor): Promise<ProfileStats> {
  // todo: audit pending
  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM workouts WHERE ended_at IS NOT NULL'
  );

  // todo: audit pending
  const volumeRow = await db.getFirstAsync<{ volume: number | null }>(
    `SELECT SUM(ls.weight * ls.reps) AS volume
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE ls.completed = 1 AND w.ended_at IS NOT NULL
        AND ls.weight IS NOT NULL AND ls.reps IS NOT NULL`
  );

  // todo: audit pending
  const dateRows = await db.getAllAsync<{ day: string }>(
    `SELECT DISTINCT date(started_at, 'localtime') AS day FROM workouts WHERE ended_at IS NOT NULL ORDER BY day DESC`
  );

  return {
    workoutCount: countRow?.count ?? 0,
    totalVolume: volumeRow?.volume ?? 0,
    streakDays: computeStreakDays(
      dateRows.map((r) => r.day),
      localDateKey(new Date())
    ),
  };
}

type RawLoggedSet = Omit<LoggedSet, 'completed'> & { completed: number };

function mapLoggedSet(row: RawLoggedSet): LoggedSet {
  return { ...row, completed: row.completed === 1 };
}
