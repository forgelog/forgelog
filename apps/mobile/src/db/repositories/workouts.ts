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

/**
 * Creates a new active workout and returns its persisted workout row.
 *
 * The workout snapshots the profile's current bodyweight. When `routineId` is
 * provided, it also copies the routine's ordered exercises, exercise types,
 * notes, superset groups, and set targets into new workout rows. These copies
 * keep an in-progress or historical workout independent from later routine and
 * exercise-catalog edits. `name` overrides the routine name; workouts without
 * either use "Workout".
 *
 * Exposed as `store.workouts.start` and run in a transaction by the mobile
 * store. `startOrResumeWorkout` uses it after confirming there is no active
 * workout, which powers the empty-workout and routine start actions on Home.
 */
export async function startWorkout(
  db: DatabaseExecutor,
  options: {
    routineId?: string;
    name?: string;
  } = {}
): Promise<Workout> {
  const workoutId = id();
  const startedAt = new Date().toISOString();

  const routine = options.routineId ? await getRoutineDetail(db, options.routineId) : null;
  const name = options.name ?? routine?.name ?? 'Workout';
  const profile = await db.getFirstAsync<{ bodyweight_kg: number | null }>(
    'SELECT bodyweight_kg FROM profile WHERE id = 0'
  );

  await db.runAsync(
    `INSERT INTO workouts
         (id, routine_id, name, started_at, bodyweight_kg, routine_structure_version)
       VALUES
         ($id, $routine_id, $name, $started_at, $bodyweight_kg, $routine_structure_version)`,
    {
      $id: workoutId,
      $routine_id: options.routineId ?? null,
      $name: name,
      $started_at: startedAt,
      $bodyweight_kg: profile?.bodyweight_kg ?? null,
      $routine_structure_version: routine ? 1 : null,
    }
  );

  if (routine) {
    for (const re of routine.exercises) {
      const weId = id();
      await db.runAsync(
        `INSERT INTO workout_exercises
               (id, workout_id, exercise_id, position, source_routine_exercise_id,
                superset_group_id, exercise_type, notes)
             VALUES ($id, $workout_id, $exercise_id, $position, $source_routine_exercise_id,
                $superset_group_id, $exercise_type, $notes)`,
        {
          $id: weId,
          $workout_id: workoutId,
          $exercise_id: re.exercise_id,
          $position: re.position,
          $source_routine_exercise_id: re.id,
          $superset_group_id: re.superset_group_id,
          // Snapshot the routine exercise type so later routine/catalog edits
          // never rewrites this logged workout.
          $exercise_type: requireExerciseType(re.exercise_type),
          $notes: re.notes,
        }
      );
      for (const s of re.sets) {
        await db.runAsync(
          `INSERT INTO logged_sets
                 (id, workout_exercise_id, position, source_routine_set_id, set_type,
                  weight, reps, duration_seconds, distance_meters, completed)
               VALUES ($id, $we, $position, $source_routine_set_id, $set_type,
                  $weight, $reps, $duration, $distance, 0)`,
          {
            $id: id(),
            $we: weId,
            $position: s.position,
            $source_routine_set_id: s.id,
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

  const created = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = $id', {
    $id: workoutId,
  });
  if (!created) throw new Error('Failed to start workout');
  return created;
}

/**
 * Returns the most recently started workout that has not been finished.
 *
 * Exposed as `store.workouts.getActive`. Home uses it to show an existing
 * workout, and `startOrResumeWorkout` uses it to enforce the app's single-active-
 * workout behavior before creating another workout. Returns `null` when every
 * workout has an `ended_at` timestamp.
 */
export async function getActiveWorkout(db: DatabaseExecutor): Promise<Workout | null> {
  const row = await db.getFirstAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return row ?? null;
}

/**
 * Loads a workout together with its ordered exercises, catalog metadata, and
 * ordered logged sets.
 *
 * SQLite exercise fields stored as JSON are decoded into arrays, integer
 * booleans are converted to JavaScript booleans, and missing catalog exercises
 * are omitted from the detail rather than failing the whole read. Returns
 * `null` when the workout itself does not exist.
 *
 * Exposed as `store.workouts.getDetail`. The active and historical workout
 * screens use it for rendering; `discardWorkout` also uses it to collect the
 * exercise IDs whose personal records must be recomputed after deletion.
 */
export async function getWorkoutDetail(
  db: DatabaseExecutor,
  workoutId: string
): Promise<WorkoutDetail | null> {
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

/**
 * Returns the ordered sets from the latest completed workout-exercise row for
 * an exercise, excluding a specified workout.
 *
 * The exclusion prevents the active workout from becoming its own reference.
 * An empty array means no earlier completed workout exists. Exposed as
 * `store.workouts.getPreviousExerciseSets`; Active Workout calls it for every
 * displayed exercise to populate the "PREV" reference values.
 */
export async function getPreviousExerciseSets(
  db: DatabaseExecutor,
  exerciseId: string,
  excludeWorkoutId: string
): Promise<LoggedSet[]> {
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

export type ExerciseHistoryEntry = {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  exerciseType: string;
  sets: LoggedSet[];
  recordEvents: PersonalRecordEvent[];
};

type NonEmptyArray<T> = [T, ...T[]];

function groupBy<T, K>(values: T[], keyOf: (value: T) => K): Map<K, NonEmptyArray<T>> {
  return values.reduce<Map<K, NonEmptyArray<T>>>((groups, value) => {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
    return groups;
  }, new Map());
}

/**
 * Builds complete workout history for one exercise, newest workout first.
 *
 * Each result includes workout identity, the exercise-type snapshot, logged
 * sets, and personal-record events achieved in that workout. If an exercise
 * appears in multiple blocks in one workout, their sets are folded into one
 * history entry.
 *
 * Exposed as `store.workouts.listExerciseHistory` and used to populate the
 * History tab on Exercise Detail.
 */
export async function listExerciseHistory(
  db: DatabaseExecutor,
  exerciseId: string
): Promise<ExerciseHistoryEntry[]> {
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
  const recordEvents = await db.getAllAsync<PersonalRecordEvent>(
    `SELECT * FROM personal_record_events
      WHERE exercise_id = $id
      ORDER BY achieved_at, record_type`,
    { $id: exerciseId }
  );
  const sets = await db.getAllAsync<RawLoggedSet>(
    `SELECT ls.*
       FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
       JOIN workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = $id AND w.ended_at IS NOT NULL
      ORDER BY w.started_at DESC, we.position, ls.position`,
    { $id: exerciseId }
  );

  const eventsByWorkout = groupBy(recordEvents, (event) => event.workout_id);
  const setsByWorkoutExercise = groupBy(sets, (set) => set.workout_exercise_id);
  const exercisesByWorkout = groupBy(workoutExercises, (exercise) => exercise.workout_id);

  return [...exercisesByWorkout.values()].map(([firstExercise, ...workoutExerciseRows]) => ({
    workoutId: firstExercise.workout_id,
    workoutName: firstExercise.workout_name,
    startedAt: firstExercise.started_at,
    exerciseType: requireExerciseType(firstExercise.exercise_type),
    sets: [firstExercise, ...workoutExerciseRows].flatMap((exercise) =>
      (setsByWorkoutExercise.get(exercise.we_id) ?? []).map(mapLoggedSet)
    ),
    recordEvents: eventsByWorkout.get(firstExercise.workout_id) ?? [],
  }));
}

/**
 * Appends an exercise to a workout and returns the new workout-exercise row.
 *
 * Its position follows the workout's current final exercise. The exercise type
 * is copied from the catalog so subsequent catalog edits cannot change how the
 * logged exercise is interpreted. Throws when the catalog exercise is missing
 * or the inserted row cannot be read back.
 *
 * Exposed as `store.workouts.addExercise`; Active Workout calls it when the
 * exercise picker returns a selection.
 */
export async function addExerciseToWorkout(
  db: DatabaseExecutor,
  workoutId: string,
  exerciseId: string
): Promise<WorkoutExercise> {
  const newId = id();
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM workout_exercises WHERE workout_id = $id',
    { $id: workoutId }
  );
  const exercise = await db.getFirstAsync<{ exercise_type: string }>(
    'SELECT exercise_type FROM exercises WHERE id = $id',
    { $id: exerciseId }
  );
  if (!exercise) throw new Error('Exercise not found');
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
  const created = await db.getFirstAsync<WorkoutExercise>(
    'SELECT * FROM workout_exercises WHERE id = $id',
    { $id: newId }
  );
  if (!created) throw new Error('Failed to add exercise to workout');
  return created;
}

/**
 * Moves one exercise by a single position within its workout.
 *
 * Boundary moves are no-ops. Positions are normalized after a successful move
 * so ordering stays deterministic even when earlier deletions left gaps.
 * Exposed as `store.workouts.moveExercise`; Active Workout uses it to persist
 * the order shown by its up and down controls.
 */
export async function moveWorkoutExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  delta: -1 | 1
): Promise<void> {
  const exercise = await db.getFirstAsync<Pick<WorkoutExercise, 'workout_id'>>(
    'SELECT workout_id FROM workout_exercises WHERE id = $id',
    { $id: workoutExerciseId }
  );
  if (!exercise) throw new Error('Workout exercise not found');

  const exercises = await db.getAllAsync<Pick<WorkoutExercise, 'id'>>(
    'SELECT id FROM workout_exercises WHERE workout_id = $workoutId ORDER BY position, id',
    { $workoutId: exercise.workout_id }
  );
  const currentIndex = exercises.findIndex((item) => item.id === workoutExerciseId);
  const targetIndex = currentIndex + delta;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= exercises.length) return;

  [exercises[currentIndex], exercises[targetIndex]] = [
    exercises[targetIndex],
    exercises[currentIndex],
  ];
  for (const [position, item] of exercises.entries()) {
    await db.runAsync('UPDATE workout_exercises SET position = $position WHERE id = $id', {
      $id: item.id,
      $position: position,
    });
  }
}

/**
 * Appends an incomplete set to a workout exercise and returns the mapped set.
 *
 * The set is positioned after all existing sets and defaults to the `normal`
 * set type. Exposed as `store.workouts.addSet`; Active Workout uses the returned
 * row to update its local exercise state immediately after the user adds a set.
 */
export async function addSet(
  db: DatabaseExecutor,
  workoutExerciseId: string,
  setType: SetType = 'normal'
): Promise<LoggedSet> {
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

export type LoggedSetRecordContext = {
  workout_exercise_id: string;
  completed: number;
};

/**
 * Reads the minimal context needed before mutating a logged set.
 *
 * The workout-exercise ID identifies the occurrence used by personal-record
 * events, while the raw completion flag tells application services whether an
 * edit can affect existing records. Returns `null` for an unknown set.
 *
 * Exposed only on the transaction-bound store as
 * `store.workouts.getSetRecordContext`. The complete-set and edit-set use cases
 * call it before updating the set and recomputing personal records atomically.
 */
export async function getLoggedSetRecordContext(
  db: DatabaseExecutor,
  loggedSetId: string
): Promise<LoggedSetRecordContext | null> {
  return db.getFirstAsync<LoggedSetRecordContext>(
    `SELECT workout_exercise_id, completed
       FROM logged_sets
      WHERE id = $id`,
    { $id: loggedSetId }
  );
}

export type LoggedSetValueUpdate = {
  set_type?: SetType;
  weight?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  rpe?: number | null;
};

const EDITABLE_SET_COLUMNS = [
  'set_type',
  'weight',
  'reps',
  'duration_seconds',
  'distance_meters',
  'rpe',
] as const satisfies readonly (keyof LoggedSetValueUpdate)[];

/**
 * Partially updates a logged set's editable values using bound SQL parameters.
 *
 * Only properties explicitly present in `fields` are written; `null` clears a
 * nullable value and an empty object is a no-op. Completion is handled separately
 * by `setLoggedSetCompletion` because it also owns the completion timestamp.
 *
 * Exposed only on the transaction-bound store as `store.workouts.updateSetValues`.
 * The active-workout edit use case combines it with personal-record recalculation.
 */
export async function updateLoggedSetValues(
  db: DatabaseExecutor,
  loggedSetId: string,
  fields: LoggedSetValueUpdate
): Promise<void> {
  const updates = EDITABLE_SET_COLUMNS.flatMap<{
    column: (typeof EDITABLE_SET_COLUMNS)[number];
    value: string | number | null;
  }>((column) => {
    const value = fields[column];
    return value === undefined ? [] : [{ column, value }];
  });
  if (!updates.length) return;

  const assignments = updates.map(({ column }) => `${column} = $${column}`);
  const params: Record<string, string | number | null> = { $id: loggedSetId };
  for (const { column, value } of updates) params[`$${column}`] = value;

  await db.runAsync(`UPDATE logged_sets SET ${assignments.join(', ')} WHERE id = $id`, params);
}

/**
 * Changes a logged set's completion state while keeping its timestamp consistent.
 *
 * Completing an already-completed set preserves its original timestamp. Clearing
 * completion removes the timestamp, while completing it again records a new one.
 * Exposed only on the transaction-bound store as `store.workouts.setSetCompletion`.
 */
export async function setLoggedSetCompletion(
  db: DatabaseExecutor,
  loggedSetId: string,
  completed: boolean
): Promise<void> {
  const completedAt = completed ? new Date().toISOString() : null;
  await db.runAsync(
    `UPDATE logged_sets
        SET completed = $completed,
            completed_at = CASE
              WHEN $completed = 0 THEN NULL
              WHEN completed = 0 OR completed_at IS NULL THEN $completed_at
              ELSE completed_at
            END
      WHERE id = $id`,
    { $id: loggedSetId, $completed: completed ? 1 : 0, $completed_at: completedAt }
  );
}

/**
 * Permanently deletes one logged set.
 *
 * Exposed only on the transaction-bound store as `store.workouts.removeSet`.
 * It is intentionally called through the `deleteSet` application use case,
 * which first clears personal-record references and then recomputes records for
 * the affected exercise in the same transaction.
 */
export async function deleteLoggedSet(db: DatabaseExecutor, loggedSetId: string): Promise<void> {
  await db.runAsync('DELETE FROM logged_sets WHERE id = $id', { $id: loggedSetId });
}

/**
 * Permanently deletes a workout-exercise row and its cascade-owned logged sets.
 *
 * Exposed only on the transaction-bound store as
 * `store.workouts.removeExercise`. Active Workout reaches it through
 * `deleteExerciseFromWorkout`, which clears set references and recomputes
 * personal records in the same transaction.
 */
export async function deleteWorkoutExercise(
  db: DatabaseExecutor,
  workoutExerciseId: string
): Promise<void> {
  await db.runAsync('DELETE FROM workout_exercises WHERE id = $id', { $id: workoutExerciseId });
}

/**
 * Reports whether any exercise in a workout contains a completed set.
 *
 * This is a pure helper exposed as `store.workouts.hasCompletedSet`. Active
 * Workout uses it to prevent finishing an empty workout or one containing only
 * incomplete sets.
 */
export function hasCompletedSet(exercises: { sets: { completed: boolean }[] }[]): boolean {
  return exercises.some((we) => we.sets.some((s) => s.completed));
}

/**
 * Marks a workout complete by recording the current time in `ended_at`.
 *
 * Exposed as `store.workouts.finish`. Active Workout calls it after the user
 * confirms finishing and after `hasCompletedSet` validates that some work was
 * logged. The operation does not itself validate completed sets.
 */
export async function finishWorkout(db: DatabaseExecutor, workoutId: string): Promise<void> {
  await db.runAsync('UPDATE workouts SET ended_at = $ended WHERE id = $id', {
    $ended: new Date().toISOString(),
    $id: workoutId,
  });
}

/**
 * Permanently deletes a workout and its cascade-owned exercise and set rows.
 *
 * Exposed only on the transaction-bound store as `store.workouts.remove`. Home,
 * Active Workout, and Workout Detail reach it through `discardWorkout`, which
 * first clears personal-record references and later rebuilds affected records
 * within the same transaction.
 */
export async function deleteWorkout(db: DatabaseExecutor, workoutId: string): Promise<void> {
  await db.runAsync('DELETE FROM workouts WHERE id = $id', { $id: workoutId });
}

/**
 * Lists completed workouts in reverse chronological order.
 *
 * Active workouts are excluded by requiring a non-null `ended_at`. Exposed as
 * `store.workouts.list`; History uses the result for its calendar markers and
 * month-grouped workout list.
 */
export async function listWorkouts(db: DatabaseExecutor): Promise<Workout[]> {
  return db.getAllAsync<Workout>(
    'SELECT * FROM workouts WHERE ended_at IS NOT NULL ORDER BY started_at DESC'
  );
}

type RawLoggedSet = Omit<LoggedSet, 'completed'> & { completed: number };

/**
 * Converts SQLite's integer completion flag into the boolean used by the app.
 *
 * Used whenever this repository returns logged sets from workout detail,
 * previous exercise sets, exercise history, or set creation.
 */
function mapLoggedSet(row: RawLoggedSet): LoggedSet {
  return { ...row, completed: row.completed === 1 };
}
