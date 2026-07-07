import type { SQLiteDatabase } from 'expo-sqlite';

import seedData from './exercises.seed.json';

export type RawSeedExercise = {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  instructions: string[];
  images: string[];
};

export type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  tracking_type: string | null;
  is_custom: number;
  instructions: string | null;
  images: string | null;
};

export function toExerciseRow(raw: RawSeedExercise): ExerciseRow {
  return {
    id: raw.id,
    name: raw.name,
    muscle_group: raw.primaryMuscles[0],
    equipment: raw.equipment ?? 'other',
    tracking_type: null,
    is_custom: 0,
    instructions: JSON.stringify(raw.instructions ?? []),
    images: JSON.stringify(raw.images ?? []),
  };
}

export async function seedExercises(db: SQLiteDatabase): Promise<void> {
  const seeded = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM exercises WHERE is_custom = 0'
  );
  if ((seeded?.count ?? 0) > 0) return;

  const rows = (seedData as RawSeedExercise[]).map(toExerciseRow);

  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(
      `INSERT OR IGNORE INTO exercises
         (id, name, muscle_group, equipment, tracking_type, is_custom, instructions, images)
       VALUES ($id, $name, $muscle_group, $equipment, $tracking_type, $is_custom, $instructions, $images)`
    );
    try {
      for (const row of rows) {
        await stmt.executeAsync({
          $id: row.id,
          $name: row.name,
          $muscle_group: row.muscle_group,
          $equipment: row.equipment,
          $tracking_type: row.tracking_type,
          $is_custom: row.is_custom,
          $instructions: row.instructions,
          $images: row.images,
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}
