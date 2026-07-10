import { getDb } from '../index';
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

type ProfileRow = {
  name: string;
  theme_mode: ThemeMode;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  bodyweight_kg: number | null;
};

export async function getProfile(): Promise<Profile> {
  const db = await getDb();
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

export async function updateProfile(patch: ProfileUpdate): Promise<void> {
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

  const db = await getDb();
  await db.runAsync(`UPDATE profile SET ${sets.join(', ')} WHERE id = 0`, params);
}

export async function setProfileName(name: string): Promise<void> {
  const { value, error } = validateText(name, {
    maxLength: NAME_MAX_LENGTH,
    fieldLabel: 'Name',
  });
  if (error) throw new Error(error);
  const db = await getDb();
  await db.runAsync('UPDATE profile SET name = $name WHERE id = 0', { $name: value });
}

export async function getThemeMode(): Promise<ThemeMode> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ theme_mode: ThemeMode }>(
    'SELECT theme_mode FROM profile WHERE id = 0'
  );
  return row?.theme_mode ?? 'system';
}

export async function setThemeMode(mode: ThemeMode): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE profile SET theme_mode = $mode WHERE id = 0', { $mode: mode });
}
