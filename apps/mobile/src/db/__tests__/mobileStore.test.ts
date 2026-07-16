import { resetDbForTests } from '../index';
import { mobileStore, runInMobileStoreTransaction } from '../mobileStore';

beforeEach(() => {
  resetDbForTests();
});

test('mobileStore omits invariant-breaking workout and record primitives', () => {
  expect(mobileStore).not.toHaveProperty('transaction');
  expect(mobileStore.workouts).not.toHaveProperty('start');
  expect(mobileStore.workouts).not.toHaveProperty('updateSet');
  expect(mobileStore.workouts).not.toHaveProperty('removeSet');
  expect(mobileStore.workouts).not.toHaveProperty('removeExercise');
  expect(mobileStore.workouts).not.toHaveProperty('remove');
  expect(mobileStore.records).not.toHaveProperty('replaceForExercise');
  expect(mobileStore.records).not.toHaveProperty('clearSetReference');
});

test('mobileStore exposes feature operations through one persistence entry point', async () => {
  const bench = (await mobileStore.exercises.list({ search: 'Barbell Bench Press - Medium Grip' })).find(
    (exercise) => exercise.name === 'Barbell Bench Press - Medium Grip'
  );
  expect(bench).toBeDefined();

  await mobileStore.profile.completeOnboarding({ name: 'Jordan', bodyweightKg: 75 });
  await expect(mobileStore.profile.get()).resolves.toMatchObject({ name: 'Jordan' });

  const routine = await mobileStore.routines.create('Facade routine');
  const routineExercise = await mobileStore.routines.addExercise(routine.id, bench?.id ?? 'missing');
  await mobileStore.routines.addSet(routineExercise.id, { target_weight: 80, target_reps: 5 });

  const workout = await runInMobileStoreTransaction((store) =>
    store.workouts.start({ routineId: routine.id })
  );
  await expect(mobileStore.workouts.getDetail(workout.id)).resolves.toMatchObject({
    id: workout.id,
    exercises: [expect.objectContaining({ exercise_id: bench?.id })],
  });
});

test('transaction supplies a bound store and returns its result', async () => {
  const result = await runInMobileStoreTransaction(async (store) => {
    const routine = await store.routines.create('Transactional routine');
    return routine.name;
  });

  expect(result).toBe('Transactional routine');
  await expect(mobileStore.routines.list()).resolves.toEqual([
    expect.objectContaining({ name: 'Transactional routine' }),
  ]);
});

test('transaction-bound atomic operations do not nest and roll back together', async () => {
  await expect(
    runInMobileStoreTransaction(async (store) => {
      await store.workouts.start({ name: 'Rolled back workout' });
      throw new Error('abort transaction');
    })
  ).rejects.toThrow('abort transaction');

  await expect(mobileStore.workouts.getActive()).resolves.toBeNull();
});

test('overlapping exclusive transactions isolate rollback from the next commit', async () => {
  let releaseFirst!: () => void;
  let markFirstStarted!: () => void;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const events: string[] = [];

  const failingTransaction = runInMobileStoreTransaction(async (store) => {
    await store.routines.create('Rolled back routine');
    events.push('first write');
    markFirstStarted();
    await firstCanFinish;
    throw new Error('abort first transaction');
  });

  await firstStarted;
  const successfulTransaction = runInMobileStoreTransaction(async (store) => {
    events.push('second start');
    await store.routines.create('Committed routine');
  });

  await Promise.resolve();
  expect(events).toEqual(['first write']);

  releaseFirst();
  await expect(failingTransaction).rejects.toThrow('abort first transaction');
  await successfulTransaction;

  expect(events).toEqual(['first write', 'second start']);
  await expect(mobileStore.routines.list()).resolves.toEqual([
    expect.objectContaining({ name: 'Committed routine' }),
  ]);
});
