import type { DatabaseExecutor } from '../executor';
import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_MIN_KG,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  validateBirthDateIso,
  validateNumber,
} from '../../validation/numericInput';
import { NAME_MAX_LENGTH, validateText } from '../../validation/textInput';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Sex = 'male' | 'female' | 'prefer_not_to_say';

export type Profile = {
  name: string;
  themeMode: ThemeMode;
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  bodyweightKg: number | null;
};

export type ProfileUpdate = {
  name?: string;
  sex?: Sex | null;
  birthDate?: string | null;
  heightCm?: number | null;
  bodyweightKg?: number | null;
};

export type OnboardingProfile = {
  name: string;
  bodyweightKg?: number | null;
};

type ProfileRow = {
  name: string;
  theme_mode: ThemeMode;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  bodyweight_kg: number | null;
};

export async function hasCompletedOnboarding(db: DatabaseExecutor): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM profile WHERE id = 0');
  return row !== null && row.name.trim().length !== 0;
}

export async function completeOnboarding(
  db: DatabaseExecutor,
  input: OnboardingProfile
): Promise<void> {
  const name = validateText(input.name, {
    maxLength: NAME_MAX_LENGTH,
    required: true,
    fieldLabel: 'Name',
  });
  if (name.error) throw new Error(name.error);

  const bodyweight =
    input.bodyweightKg == null
      ? { value: null, error: null }
      : validateNumber(input.bodyweightKg, {
          min: BODYWEIGHT_MIN_KG,
          max: BODYWEIGHT_MAX_KG,
          fieldLabel: 'Bodyweight',
        });
  if (bodyweight.error) {
    throw new Error(bodyweight.error);
  }

  await db.runAsync(
    `INSERT INTO profile (id, name, bodyweight_kg)
     VALUES (0, $name, $bodyweightKg)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, bodyweight_kg = excluded.bodyweight_kg`,
    { $name: name.value, $bodyweightKg: bodyweight.value }
  );
}

export async function getProfile(db: DatabaseExecutor): Promise<Profile> {
  // todo: audit pending
  const row = await db.getFirstAsync<ProfileRow>(
    'SELECT name, theme_mode, sex, birth_date, height_cm, bodyweight_kg FROM profile WHERE id = 0'
  );
  return {
    name: row?.name ?? '',
    themeMode: row?.theme_mode ?? 'system',
    sex: row?.sex ?? null,
    birthDate: row?.birth_date ?? null,
    heightCm: row?.height_cm ?? null,
    bodyweightKg: row?.bodyweight_kg ?? null,
  };
}

export async function updateProfile(db: DatabaseExecutor, patch: ProfileUpdate): Promise<void> {
  const sets: string[] = [];
  const params: Record<string, string | number | null> = {};

  if (patch.name !== undefined) {
    const { value, error } = validateText(patch.name, {
      maxLength: NAME_MAX_LENGTH,
      fieldLabel: 'Name',
    });
    if (error) throw new Error(error);
    sets.push('name = $name');
    params.$name = value;
  }

  if (patch.sex !== undefined) {
    sets.push('sex = $sex');
    params.$sex = patch.sex;
  }

  if (patch.birthDate !== undefined) {
    const { value, error } = validateBirthDateIso(patch.birthDate);
    if (error) throw new Error(error);
    sets.push('birth_date = $birthDate');
    params.$birthDate = value;
  }

  if (patch.heightCm !== undefined) {
    const { value, error } = validateNumber(patch.heightCm, {
      min: HEIGHT_MIN_CM,
      max: HEIGHT_MAX_CM,
      fieldLabel: 'Height',
    });
    if (error) throw new Error(error);
    sets.push('height_cm = $heightCm');
    params.$heightCm = value;
  }

  if (patch.bodyweightKg !== undefined) {
    const { value, error } = validateNumber(patch.bodyweightKg, {
      min: BODYWEIGHT_MIN_KG,
      max: BODYWEIGHT_MAX_KG,
      fieldLabel: 'Bodyweight',
    });
    if (error) throw new Error(error);
    sets.push('bodyweight_kg = $bodyweightKg');
    params.$bodyweightKg = value;
  }

  if (sets.length === 0) return;

  // todo: audit pending
  await db.runAsync(`UPDATE profile SET ${sets.join(', ')} WHERE id = 0`, params);
}

export async function setProfileName(db: DatabaseExecutor, name: string): Promise<void> {
  const { value, error } = validateText(name, {
    maxLength: NAME_MAX_LENGTH,
    fieldLabel: 'Name',
  });
  if (error) throw new Error(error);
  // todo: audit pending
  await db.runAsync('UPDATE profile SET name = $name WHERE id = 0', { $name: value });
}

export async function getThemeMode(db: DatabaseExecutor): Promise<ThemeMode> {
  // todo: audit pending
  const row = await db.getFirstAsync<{ theme_mode: ThemeMode }>(
    'SELECT theme_mode FROM profile WHERE id = 0'
  );
  return row?.theme_mode ?? 'system';
}

export async function setThemeMode(db: DatabaseExecutor, mode: ThemeMode): Promise<void> {
  // todo: audit pending
  await db.runAsync('UPDATE profile SET theme_mode = $mode WHERE id = 0', { $mode: mode });
}
