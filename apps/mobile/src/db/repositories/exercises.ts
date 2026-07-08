import { getDb } from '../index';
import { id } from '../id';
import type { Exercise } from '../types';

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

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscle_group: row.muscle_group,
    equipment: row.equipment,
    tracking_type: row.tracking_type,
    is_custom: row.is_custom === 1,
    instructions: row.instructions ? (JSON.parse(row.instructions) as string[]) : [],
    images: row.images ? (JSON.parse(row.images) as string[]) : [],
    secondary_muscles: row.secondary_muscles ? (JSON.parse(row.secondary_muscles) as string[]) : [],
    created_at: row.created_at,
  };
}

export type ExerciseFilters = {
  muscleGroup?: string;
  equipment?: string;
  search?: string;
};

export async function listExercises(filters: ExerciseFilters = {}): Promise<Exercise[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: Record<string, string> = {};

  if (filters.muscleGroup) {
    where.push('muscle_group = $muscleGroup');
    params.$muscleGroup = filters.muscleGroup;
  }
  if (filters.equipment) {
    where.push('equipment = $equipment');
    params.$equipment = filters.equipment;
  }
  if (filters.search) {
    where.push('name LIKE $search');
    params.$search = `%${filters.search}%`;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT * FROM exercises ${clause} ORDER BY name COLLATE NOCASE`,
    params
  );
  return rows.map(mapExercise);
}

export async function getExercise(exerciseId: string): Promise<Exercise | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = $id', {
    $id: exerciseId,
  });
  return row ? mapExercise(row) : null;
}

export type NewCustomExercise = {
  name: string;
  muscle_group: string;
  equipment: string;
  tracking_type?: string | null;
  instructions?: string[];
};

export async function createCustomExercise(input: NewCustomExercise): Promise<Exercise> {
  const db = await getDb();
  const newId = id();
  await db.runAsync(
    `INSERT INTO exercises
       (id, name, muscle_group, equipment, tracking_type, is_custom, instructions, images)
     VALUES ($id, $name, $muscle_group, $equipment, $tracking_type, 1, $instructions, $images)`,
    {
      $id: newId,
      $name: input.name,
      $muscle_group: input.muscle_group,
      $equipment: input.equipment,
      $tracking_type: input.tracking_type ?? null,
      $instructions: JSON.stringify(input.instructions ?? []),
      $images: JSON.stringify([]),
    }
  );
  const created = await getExercise(newId);
  if (!created) throw new Error('Failed to create custom exercise');
  return created;
}

export async function setExerciseTrackingType(
  exerciseId: string,
  trackingType: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE exercises SET tracking_type = $t WHERE id = $id', {
    $t: trackingType,
    $id: exerciseId,
  });
}

export async function listMuscleGroups(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ muscle_group: string }>(
    'SELECT DISTINCT muscle_group FROM exercises ORDER BY muscle_group'
  );
  return rows.map((r) => r.muscle_group);
}

export async function listEquipment(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ equipment: string }>(
    'SELECT DISTINCT equipment FROM exercises ORDER BY equipment'
  );
  return rows.map((r) => r.equipment);
}
