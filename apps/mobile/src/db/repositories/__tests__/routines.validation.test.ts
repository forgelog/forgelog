import type { DatabaseExecutor } from '../../executor';
import { resetDbForTests } from '../../index';
import { mobileStoreForTests as mobileStore } from '../../../test-utils/db';
import { createRoutine, updateRoutine } from '../routines';

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
  return { runAsync, getFirstAsync } as unknown as DatabaseExecutor;
}

beforeEach(() => {
  resetDbForTests();
});

test('createRoutine rejects an empty name without touching the db', async () => {
  await expect(createRoutine(makeFakeDb(), '   ')).rejects.toThrow('Routine name is required.');
});

test('createRoutine rejects a name over the max length', async () => {
  const long = 'a'.repeat(101);
  await expect(createRoutine(makeFakeDb(), long)).rejects.toThrow(/characters or fewer/);
});

test('createRoutine trims whitespace and strips control chars from a valid name', async () => {
  const routine = await mobileStore.routines.create('  Push\x00Day  ');
  expect(routine.name).toBe('PushDay');
});

test('createRoutine rejects notes over the max length', async () => {
  const long = 'a'.repeat(1001);
  await expect(createRoutine(makeFakeDb(), 'Push Day', long)).rejects.toThrow(
    /characters or fewer/
  );
});

test('updateRoutine rejects an empty name', async () => {
  await expect(updateRoutine(makeFakeDb(), 'r1', { name: '   ' })).rejects.toThrow(
    'Routine name is required.'
  );
});

test('updateRoutine allows clearing notes to null', async () => {
  const routine = await mobileStore.routines.create('Push Day', 'Heavy day');
  await mobileStore.routines.update(routine.id, { notes: null });
  await expect(mobileStore.routines.getDetail(routine.id)).resolves.toMatchObject({ notes: null });
});
