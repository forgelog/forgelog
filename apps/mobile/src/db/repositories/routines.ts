import { getDb } from '../index';
import { id } from '../id';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../../validation/textInput';
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
  tracking_type: string | null;
  is_custom: number;
  instructions: string | null;
  images: string | null;
  secondary_muscles: string | null;
  created_at: string;
};

export async function listRoutines(): Promise<Routine[]> {
  const db = await getDb();
  return db.getAllAsync<Routine>('SELECT * FROM routines ORDER BY position, created_at');
}

export async function getRoutineDetail(routineId: string): Promise<RoutineDetail | null> {
  const db = await getDb();
  const routine = await db.getFirstAsync<Routine>('SELECT * FROM routines WHERE id = $id', {
    $id: routineId,
  });
  if (!routine) return null;

  const routineExercises = await db.getAllAsync<RoutineExercise>(
    'SELECT * FROM routine_exercises WHERE routine_id = $id ORDER BY position',
    { $id: routineId }
  );

  const exercises: RoutineExerciseDetail[] = [];
  for (const re of routineExercises) {
    const exRow = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = $id', {
      $id: re.exercise_id,
    });
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
        tracking_type: exRow.tracking_type,
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

export type RoutineSummary = Routine & { exerciseCount: number; muscles: string[] };

export async function listRoutineSummaries(): Promise<RoutineSummary[]> {
  const routines = await listRoutines();
  const summaries: RoutineSummary[] = [];
  for (const routine of routines) {
    const detail = await getRoutineDetail(routine.id);
    const muscles = [...new Set((detail?.exercises ?? []).map((e) => e.exercise.muscle_group))];
    summaries.push({
      ...routine,
      exerciseCount: detail?.exercises.length ?? 0,
      muscles,
    });
  }
  return summaries;
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

export async function createRoutine(name: string, notes?: string): Promise<Routine> {
  const validName = validateRoutineName(name);
  const validNotes = validateRoutineNotes(notes);
  const db = await getDb();
  const newId = id();
  const position = await nextRoutinePosition(db);
  await db.runAsync(
    'INSERT INTO routines (id, name, notes, position) VALUES ($id, $name, $notes, $position)',
    { $id: newId, $name: validName, $notes: validNotes, $position: position }
  );
  const created = await db.getFirstAsync<Routine>('SELECT * FROM routines WHERE id = $id', {
    $id: newId,
  });
  if (!created) throw new Error('Failed to create routine');
  return created;
}

export async function updateRoutine(
  routineId: string,
  fields: { name?: string; notes?: string | null }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: Record<string, string | null> = { $id: routineId };
  if (fields.name !== undefined) {
    sets.push('name = $name');
    params.$name = validateRoutineName(fields.name);
  }
  if (fields.notes !== undefined) {
    sets.push('notes = $notes');
    params.$notes = validateRoutineNotes(fields.notes);
  }
  if (!sets.length) return;
  sets.push("updated_at = datetime('now')");
  await db.runAsync(`UPDATE routines SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM routines WHERE id = $id', { $id: routineId });
}

export async function addExerciseToRoutine(
  routineId: string,
  exerciseId: string
): Promise<RoutineExercise> {
  const db = await getDb();
  const newId = id();
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM routine_exercises WHERE routine_id = $id',
    { $id: routineId }
  );
  await db.runAsync(
    `INSERT INTO routine_exercises (id, routine_id, exercise_id, position)
     VALUES ($id, $routine_id, $exercise_id, $position)`,
    { $id: newId, $routine_id: routineId, $exercise_id: exerciseId, $position: row?.next ?? 0 }
  );
  const created = await db.getFirstAsync<RoutineExercise>(
    'SELECT * FROM routine_exercises WHERE id = $id',
    { $id: newId }
  );
  if (!created) throw new Error('Failed to add exercise to routine');
  return created;
}

export async function removeRoutineExercise(routineExerciseId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM routine_exercises WHERE id = $id', { $id: routineExerciseId });
}

export async function updateRoutineExercise(
  routineExerciseId: string,
  fields: {
    rest_seconds?: number | null;
    superset_group_id?: string | null;
    tracking_type?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  type RoutineExerciseUpdateValue = string | number | null;
  const params: Record<string, RoutineExerciseUpdateValue> = { $id: routineExerciseId };
  if (fields.rest_seconds !== undefined) {
    sets.push('rest_seconds = $rest');
    params.$rest = fields.rest_seconds;
  }
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
  await db.runAsync(`UPDATE routine_exercises SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function reorderRoutineExercises(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE routine_exercises SET position = $pos WHERE id = $id', {
        $pos: i,
        $id: orderedIds[i],
      });
    }
  });
}

export type RoutineSetInput = {
  set_type?: SetType;
  target_weight?: number | null;
  target_reps?: number | null;
  target_duration_seconds?: number | null;
  target_distance_meters?: number | null;
};

export type SaveRoutineDraftInput = {
  routineId?: string;
  name: string;
  notes?: string | null;
  exercises: {
    exercise_id: string;
    superset_group_id?: string | null;
    rest_seconds: number | null;
    tracking_type: string | null;
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

export async function saveRoutineDraft(input: SaveRoutineDraftInput): Promise<RoutineDetail> {
  const validName = validateRoutineName(input.name);
  const validNotes = validateRoutineNotes(input.notes);
  if (input.exercises.length === 0) {
    throw new Error('Add at least one exercise before saving.');
  }
  const db = await getDb();
  const routineId = input.routineId ?? id();

  await db.withTransactionAsync(async () => {
    if (input.routineId) {
      await db.runAsync(
        "UPDATE routines SET name = $name, notes = $notes, updated_at = datetime('now') WHERE id = $id",
        { $id: routineId, $name: validName, $notes: validNotes }
      );
      await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = $id', {
        $id: routineId,
      });
    } else {
      const position = await nextRoutinePosition(db);
      await db.runAsync(
        'INSERT INTO routines (id, name, notes, position) VALUES ($id, $name, $notes, $position)',
        { $id: routineId, $name: validName, $notes: validNotes, $position: position }
      );
    }

    for (let exerciseIndex = 0; exerciseIndex < input.exercises.length; exerciseIndex++) {
      const exercise = input.exercises[exerciseIndex];
      const exerciseExists = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM exercises WHERE id = $id',
        { $id: exercise.exercise_id }
      );
      if (!exerciseExists) throw new Error('Exercise not found');
      const routineExerciseId = id();
      await db.runAsync(
        `INSERT INTO routine_exercises
           (id, routine_id, exercise_id, position, superset_group_id, rest_seconds, tracking_type, notes)
         VALUES ($id, $routine_id, $exercise_id, $position, $superset_group_id, $rest_seconds, $tracking_type, $notes)`,
        {
          $id: routineExerciseId,
          $routine_id: routineId,
          $exercise_id: exercise.exercise_id,
          $position: exerciseIndex,
          $superset_group_id: exercise.superset_group_id ?? null,
          $rest_seconds: exercise.rest_seconds,
          $tracking_type: exercise.tracking_type,
          $notes: exercise.notes,
        }
      );

      for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
        const set = exercise.sets[setIndex];
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
  });

  const saved = await getRoutineDetail(routineId);
  if (!saved) throw new Error('Failed to save routine');
  return saved;
}

export async function addRoutineSet(
  routineExerciseId: string,
  input: RoutineSetInput = {}
): Promise<RoutineSet> {
  const db = await getDb();
  const newId = id();
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM routine_sets WHERE routine_exercise_id = $id',
    { $id: routineExerciseId }
  );
  await db.runAsync(
    `INSERT INTO routine_sets
       (id, routine_exercise_id, position, set_type,
        target_weight, target_reps, target_duration_seconds, target_distance_meters)
     VALUES ($id, $rex, $position, $set_type,
        $target_weight, $target_reps, $target_duration_seconds, $target_distance_meters)`,
    {
      $id: newId,
      $rex: routineExerciseId,
      $position: row?.next ?? 0,
      $set_type: input.set_type ?? 'normal',
      $target_weight: input.target_weight ?? null,
      $target_reps: input.target_reps ?? null,
      $target_duration_seconds: input.target_duration_seconds ?? null,
      $target_distance_meters: input.target_distance_meters ?? null,
    }
  );
  const created = await db.getFirstAsync<RoutineSet>('SELECT * FROM routine_sets WHERE id = $id', {
    $id: newId,
  });
  if (!created) throw new Error('Failed to add routine set');
  return created;
}

export async function updateRoutineSet(
  setId: string,
  fields: RoutineSetInput
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { $id: setId };
  const assign = (col: string, key: string, value: string | number | null) => {
    sets.push(`${col} = ${key}`);
    params[key] = value;
  };
  if (fields.set_type !== undefined) assign('set_type', '$set_type', fields.set_type);
  if (fields.target_weight !== undefined) assign('target_weight', '$weight', fields.target_weight);
  if (fields.target_reps !== undefined) assign('target_reps', '$reps', fields.target_reps);
  if (fields.target_duration_seconds !== undefined)
    assign('target_duration_seconds', '$duration', fields.target_duration_seconds);
  if (fields.target_distance_meters !== undefined)
    assign('target_distance_meters', '$distance', fields.target_distance_meters);
  if (!sets.length) return;
  await db.runAsync(`UPDATE routine_sets SET ${sets.join(', ')} WHERE id = $id`, params);
}

export async function deleteRoutineSet(setId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM routine_sets WHERE id = $id', { $id: setId });
}

async function nextRoutinePosition(db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM routines'
  );
  return row?.next ?? 0;
}
