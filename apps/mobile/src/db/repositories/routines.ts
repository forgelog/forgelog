import { requireExerciseType } from '../../domain/setFields';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../../validation/textInput';
import type { DatabaseExecutor } from '../executor';
import { id } from '../id';
import type {
  Routine,
  RoutineDetail,
  RoutineExercise,
  RoutineExerciseDetail,
  RoutineSet,
  SetType,
} from '../types';

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

export async function listRoutines(db: DatabaseExecutor): Promise<Routine[]> {
  // todo: audit pending
  return db.getAllAsync<Routine>('SELECT * FROM routines ORDER BY position, created_at');
}

export async function getRoutineDetail(
  db: DatabaseExecutor,
  routineId: string
): Promise<RoutineDetail | null> {
  // todo: audit pending
  const routine = await db.getFirstAsync<Routine>('SELECT * FROM routines WHERE id = $id', {
    $id: routineId,
  });
  if (!routine) return null;

  // todo: audit pending
  const routineExercises = await db.getAllAsync<RoutineExercise>(
    'SELECT * FROM routine_exercises WHERE routine_id = $id ORDER BY position',
    { $id: routineId }
  );

  const exercises: RoutineExerciseDetail[] = [];
  for (const re of routineExercises) {
    // todo: audit pending
    const exRow = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = $id', {
      $id: re.exercise_id,
    });
    // todo: audit pending
    const sets = await db.getAllAsync<RoutineSet>(
      'SELECT * FROM routine_sets WHERE routine_exercise_id = $id ORDER BY position',
      { $id: re.id }
    );
    if (!exRow) continue;
    exercises.push({
      ...re,
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
      sets,
    });
  }

  return { ...routine, exercises };
}

export type RoutineSummary = Routine & { exerciseCount: number; exerciseNames: string[] };

type RoutineExerciseSummaryRow = { routine_id: string; name: string };

export async function getRoutinesWithSummaries(db: DatabaseExecutor): Promise<RoutineSummary[]> {
  const routines = await listRoutines(db);
  // todo: audit pending
  const rows = await db.getAllAsync<RoutineExerciseSummaryRow>(
    `SELECT re.routine_id, e.name
     FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id
     ORDER BY re.routine_id, re.position, e.name`
  );

  const summaries = new Map<string, { count: number; names: string[] }>();

  for (const { routine_id, name } of rows) {
    const summary = summaries.get(routine_id) ?? { count: 0, names: [] };
    summary.count += 1;
    summary.names.push(name);
    summaries.set(routine_id, summary);
  }

  return routines.map((routine) => {
    const summary = summaries.get(routine.id);
    return {
      ...routine,
      exerciseCount: summary?.count ?? 0,
      exerciseNames: summary?.names ?? [],
    };
  });
}

function validateRoutineName(name: string): string {
  const { value, error } = validateText(name, {
    required: true,
    maxLength: NAME_MAX_LENGTH,
    fieldLabel: 'Routine name',
  });
  if (error) throw new Error(error);
  return value;
}

function validateRoutineNotes(notes: string | null | undefined): string | null {
  if (notes == null) return null;
  const { value, error } = validateText(notes, {
    maxLength: NOTES_MAX_LENGTH,
    fieldLabel: 'Notes',
    multiline: true,
  });
  if (error) throw new Error(error);
  return value || null;
}

export async function deleteRoutine(db: DatabaseExecutor, routineId: string): Promise<void> {
  // todo: audit pending
  await db.runAsync('DELETE FROM routines WHERE id = $id', { $id: routineId });
}

export type SaveRoutineDraftInput = {
  routineId?: string;
  name: string;
  notes?: string | null;
  exercises: {
    exercise_id: string;
    superset_group_id?: string | null;
    exercise_type: string;
    notes: string | null;
    sets: {
      set_type: SetType;
      target_weight: number | null;
      target_reps: number | null;
      target_duration_seconds: number | null;
      target_distance_meters: number | null;
    }[];
  }[];
};

export async function saveRoutineDraft(
  db: DatabaseExecutor,
  input: SaveRoutineDraftInput
): Promise<RoutineDetail> {
  const validName = validateRoutineName(input.name);
  const validNotes = validateRoutineNotes(input.notes);
  if (input.exercises.length === 0) {
    throw new Error('Add at least one exercise before saving.');
  }
  const routineId = input.routineId ?? id();

  if (input.routineId) {
    // todo: audit pending
    await db.runAsync(
      "UPDATE routines SET name = $name, notes = $notes, updated_at = datetime('now') WHERE id = $id",
      { $id: routineId, $name: validName, $notes: validNotes }
    );
    // todo: audit pending
    await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = $id', {
      $id: routineId,
    });
  } else {
    const position = await nextRoutinePosition(db);
    // todo: audit pending
    await db.runAsync(
      'INSERT INTO routines (id, name, notes, position) VALUES ($id, $name, $notes, $position)',
      { $id: routineId, $name: validName, $notes: validNotes, $position: position }
    );
  }

  for (let exerciseIndex = 0; exerciseIndex < input.exercises.length; exerciseIndex++) {
    const exercise = input.exercises[exerciseIndex];
    // todo: audit pending
    const exerciseExists = await db.getFirstAsync<{ id: string; exercise_type: string }>(
      'SELECT id, exercise_type FROM exercises WHERE id = $id',
      { $id: exercise.exercise_id }
    );
    if (!exerciseExists) throw new Error('Exercise not found');
    const exerciseType = requireExerciseType(exerciseExists.exercise_type);
    const routineExerciseId = id();
    // todo: audit pending
    await db.runAsync(
      `INSERT INTO routine_exercises
           (id, routine_id, exercise_id, position, superset_group_id, exercise_type, notes)
         VALUES ($id, $routine_id, $exercise_id, $position, $superset_group_id, $exercise_type, $notes)`,
      {
        $id: routineExerciseId,
        $routine_id: routineId,
        $exercise_id: exercise.exercise_id,
        $position: exerciseIndex,
        $superset_group_id: exercise.superset_group_id ?? null,
        $exercise_type: exerciseType,
        $notes: exercise.notes,
      }
    );

    for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
      const set = exercise.sets[setIndex];
      // todo: audit pending
      await db.runAsync(
        `INSERT INTO routine_sets
             (id, routine_exercise_id, position, set_type,
              target_weight, target_reps, target_duration_seconds, target_distance_meters)
           VALUES ($id, $routine_exercise_id, $position, $set_type,
              $target_weight, $target_reps, $target_duration_seconds, $target_distance_meters)`,
        {
          $id: id(),
          $routine_exercise_id: routineExerciseId,
          $position: setIndex,
          $set_type: set.set_type,
          $target_weight: set.target_weight,
          $target_reps: set.target_reps,
          $target_duration_seconds: set.target_duration_seconds,
          $target_distance_meters: set.target_distance_meters,
        }
      );
    }
  }

  const saved = await getRoutineDetail(db, routineId);
  if (!saved) throw new Error('Failed to save routine');
  return saved;
}

async function nextRoutinePosition(db: DatabaseExecutor): Promise<number> {
  // todo: audit pending
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM routines'
  );
  return row?.next ?? 0;
}
