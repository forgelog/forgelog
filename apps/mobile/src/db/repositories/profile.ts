import { getDb } from '../index';

export type ThemeMode = 'system' | 'light' | 'dark';

export async function getProfileName(): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM profile WHERE id = 0');
  return row?.name ?? 'Alex Rivera';
}

export async function setProfileName(name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE profile SET name = $name WHERE id = 0', { $name: name });
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
