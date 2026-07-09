jest.mock('../../index');

import { getDb } from '../../index';
import { createRoutine, updateRoutine } from '../routines';

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>;

function makeFakeDb() {
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const getFirstAsync = jest.fn().mockResolvedValue({
    id: 'r1',
    name: 'Push Day',
    notes: null,
    position: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  });
  return { runAsync, getFirstAsync } as unknown as Awaited<ReturnType<typeof getDb>>;
}

beforeEach(() => {
  mockGetDb.mockResolvedValue(makeFakeDb());
});

test('createRoutine rejects an empty name without touching the db', async () => {
  await expect(createRoutine('   ')).rejects.toThrow('Routine name is required.');
});

test('createRoutine rejects a name over the max length', async () => {
  const long = 'a'.repeat(101);
  await expect(createRoutine(long)).rejects.toThrow(/characters or fewer/);
});

test('createRoutine trims whitespace and strips control chars from a valid name', async () => {
  const db = makeFakeDb();
  mockGetDb.mockResolvedValue(db);
  await createRoutine('  Push\x00Day  ');
  expect(db.runAsync).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ $name: 'PushDay' })
  );
});

test('createRoutine rejects notes over the max length', async () => {
  const long = 'a'.repeat(1001);
  await expect(createRoutine('Push Day', long)).rejects.toThrow(/characters or fewer/);
});

test('updateRoutine rejects an empty name', async () => {
  await expect(updateRoutine('r1', { name: '   ' })).rejects.toThrow('Routine name is required.');
});

test('updateRoutine allows clearing notes to null', async () => {
  const db = makeFakeDb();
  mockGetDb.mockResolvedValue(db);
  await updateRoutine('r1', { notes: null });
  expect(db.runAsync).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ $notes: null })
  );
});
