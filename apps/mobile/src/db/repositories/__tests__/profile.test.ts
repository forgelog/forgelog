import type { DatabaseExecutor } from '../../executor';
import { getProfile, updateProfile } from '../profile';

function makeFakeDb(row: Record<string, unknown> | null) {
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const getFirstAsync = jest.fn().mockResolvedValue(row);
  return { runAsync, getFirstAsync } as unknown as DatabaseExecutor;
}

describe('getProfile', () => {
  test('maps a full row to a Profile', async () => {
    const db = makeFakeDb({
      name: 'Jamie Lee',
      theme_mode: 'dark',
      sex: 'female',
      birth_date: '1990-06-15',
      height_cm: 170,
      bodyweight_kg: 65,
    });

    await expect(getProfile(db)).resolves.toEqual({
      name: 'Jamie Lee',
      themeMode: 'dark',
      sex: 'female',
      birthDate: '1990-06-15',
      heightCm: 170,
      bodyweightKg: 65,
    });
  });

  test('defaults unset fields when the row has nulls', async () => {
    const db = makeFakeDb({
      name: '',
      theme_mode: 'system',
      sex: null,
      birth_date: null,
      height_cm: null,
      bodyweight_kg: null,
    });

    await expect(getProfile(db)).resolves.toEqual({
      name: '',
      themeMode: 'system',
      sex: null,
      birthDate: null,
      heightCm: null,
      bodyweightKg: null,
    });
  });
});

describe('updateProfile', () => {
  test('allows clearing the name to empty (no placeholder fallback)', async () => {
    const db = makeFakeDb(null);

    await updateProfile(db, { name: '   ' });

    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('name = $name'), {
      $name: '',
    });
  });

  test('rejects a name over the max length', async () => {
    await expect(updateProfile(makeFakeDb(null), { name: 'a'.repeat(101) })).rejects.toThrow(
      /characters or fewer/
    );
  });

  test('rejects an out-of-range height', async () => {
    await expect(updateProfile(makeFakeDb(null), { heightCm: 10 })).rejects.toThrow(
      /between 50 and 250/
    );
  });

  test('rejects an out-of-range bodyweight', async () => {
    await expect(updateProfile(makeFakeDb(null), { bodyweightKg: 999 })).rejects.toThrow(
      /between 20 and 400/
    );
  });

  test('writes only the patched fields', async () => {
    const db = makeFakeDb(null);

    await updateProfile(db, { sex: 'prefer_not_to_say', heightCm: 180 });

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('sex = $sex'),
      expect.objectContaining({ $sex: 'prefer_not_to_say', $heightCm: 180 })
    );
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.not.stringContaining('name ='),
      expect.anything()
    );
  });

  test('allows clearing a nullable field back to null', async () => {
    const db = makeFakeDb(null);

    await updateProfile(db, { birthDate: null });

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('birth_date = $birthDate'),
      expect.objectContaining({ $birthDate: null })
    );
  });

  test('rejects a birth date before 1900, even bypassing client-side validation', async () => {
    await expect(updateProfile(makeFakeDb(null), { birthDate: '1899-12-31' })).rejects.toThrow(
      /after 1900/
    );
  });

  test('rejects a malformed birth date string', async () => {
    await expect(updateProfile(makeFakeDb(null), { birthDate: 'not-a-date' })).rejects.toThrow(
      'Birth date is invalid.'
    );
  });
});
