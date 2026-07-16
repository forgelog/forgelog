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

  const routine = await mobileStore.routines.saveDraft({
    name: 'Facade routine',
    notes: null,
    exercises: [
      {
        exercise_id: bench?.id ?? 'missing',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 80,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

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
    const exercise = (await store.exercises.list({ search: 'Barbell Bench Press' }))[0];
    const routine = await store.routines.saveDraft({
      name: 'Transactional routine',
      notes: null,
      exercises: [
        { exercise_id: exercise.id, exercise_type: 'weight_reps', notes: null, sets: [] },
      ],
    });
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
    const exercise = (await store.exercises.list({ search: 'Barbell Bench Press' }))[0];
    await store.routines.saveDraft({
      name: 'Rolled back routine',
      notes: null,
      exercises: [{ exercise_id: exercise.id, exercise_type: 'weight_reps', notes: null, sets: [] }],
    });
    events.push('first write');
    markFirstStarted();
    await firstCanFinish;
    throw new Error('abort first transaction');
  });

  await firstStarted;
  const successfulTransaction = runInMobileStoreTransaction(async (store) => {
    events.push('second start');
    const exercise = (await store.exercises.list({ search: 'Barbell Bench Press' }))[0];
    await store.routines.saveDraft({
      name: 'Committed routine',
      notes: null,
      exercises: [{ exercise_id: exercise.id, exercise_type: 'weight_reps', notes: null, sets: [] }],
    });
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
