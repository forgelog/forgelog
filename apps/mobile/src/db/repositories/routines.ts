import { getDb } from '../index';
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
  tracking_type: string | null;
  is_custom: number;
  instructions: string | null;
  images: string | null;
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
        created_at: exRow.created_at,
      },
      sets,
    });
  }

  return { ...routine, exercises };
}

export async function createRoutine(name: string, notes?: string): Promise<Routine> {
  const db = await getDb();
  const newId = id();
  const position = await nextRoutinePosition(db);
  await db.runAsync(
    'INSERT INTO routines (id, name, notes, position) VALUES ($id, $name, $notes, $position)',
    { $id: newId, $name: name, $notes: notes ?? null, $position: position }
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
    params.$name = fields.name;
  }
  if (fields.notes !== undefined) {
    sets.push('notes = $notes');
    params.$notes = fields.notes;
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

// Replaces the full set list for a routine exercise (positions assigned by order).
export async function setRoutineSets(
  routineExerciseId: string,
  sets: RoutineSetInput[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_sets WHERE routine_exercise_id = $id', {
      $id: routineExerciseId,
    });
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      await db.runAsync(
        `INSERT INTO routine_sets
           (id, routine_exercise_id, position, set_type,
            target_weight, target_reps, target_duration_seconds, target_distance_meters)
         VALUES ($id, $rex, $position, $set_type,
            $target_weight, $target_reps, $target_duration_seconds, $target_distance_meters)`,
        {
          $id: id(),
          $rex: routineExerciseId,
          $position: i,
          $set_type: s.set_type ?? 'normal',
          $target_weight: s.target_weight ?? null,
          $target_reps: s.target_reps ?? null,
          $target_duration_seconds: s.target_duration_seconds ?? null,
          $target_distance_meters: s.target_distance_meters ?? null,
        }
      );
    }
  });
}

async function nextRoutinePosition(db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
  const row = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM routines'
  );
  return row?.next ?? 0;
}
