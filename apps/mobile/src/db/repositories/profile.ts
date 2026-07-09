import { getDb } from '../index';

export async function getProfileName(): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM profile WHERE id = 0');
  return row?.name ?? 'Alex Rivera';
}

export async function setProfileName(name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE profile SET name = $name WHERE id = 0', { $name: name });
}
