import type { SQLiteDatabase } from 'expo-sqlite';

import seedData from './exercises.seed.json';

export type RawSeedExercise = {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
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
  secondary_muscles: string | null;
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
    secondary_muscles: JSON.stringify(raw.secondaryMuscles ?? []),
  };
}

// Existing installs seeded before the secondary_muscles column existed have
// NULL there; backfill from the same seed JSON without touching anything else.
export async function backfillSecondaryMuscles(db: SQLiteDatabase): Promise<void> {
  const rows = seedData as RawSeedExercise[];

  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(
      `UPDATE exercises SET secondary_muscles = $secondary_muscles
       WHERE id = $id AND secondary_muscles IS NULL`
    );
    try {
      for (const row of rows) {
        await stmt.executeAsync({
          $id: row.id,
          $secondary_muscles: JSON.stringify(row.secondaryMuscles ?? []),
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
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
         (id, name, muscle_group, equipment, tracking_type, is_custom, instructions, images, secondary_muscles)
       VALUES ($id, $name, $muscle_group, $equipment, $tracking_type, $is_custom, $instructions, $images, $secondary_muscles)`
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
          $secondary_muscles: row.secondary_muscles,
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}
