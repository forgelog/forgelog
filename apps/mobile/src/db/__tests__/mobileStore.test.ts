import { resetDbForTests } from '../index';
import { mobileStore } from '../mobileStore';

beforeEach(() => {
  resetDbForTests();
});

test('mobileStore exposes feature operations through one persistence entry point', async () => {
  const bench = (await mobileStore.exercises.list({ search: 'Barbell Bench Press - Medium Grip' })).find(
    (exercise) => exercise.name === 'Barbell Bench Press - Medium Grip'
  );
  expect(bench).toBeDefined();

  await mobileStore.profile.update({ name: 'Jordan' });
  await expect(mobileStore.profile.get()).resolves.toMatchObject({ name: 'Jordan' });

  const routine = await mobileStore.routines.create('Facade routine');
  const routineExercise = await mobileStore.routines.addExercise(routine.id, bench?.id ?? 'missing');
  await mobileStore.routines.addSet(routineExercise.id, { target_weight: 80, target_reps: 5 });

  const workout = await mobileStore.workouts.start({ routineId: routine.id });
  await expect(mobileStore.workouts.getDetail(workout.id)).resolves.toMatchObject({
    id: workout.id,
    exercises: [expect.objectContaining({ exercise_id: bench?.id })],
  });
});

test('transaction supplies a bound store and returns its result', async () => {
  const result = await mobileStore.transaction(async (store) => {
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
    mobileStore.transaction(async (store) => {
      await store.workouts.start({ name: 'Rolled back workout' });
      throw new Error('abort transaction');
    })
  ).rejects.toThrow('abort transaction');

  await expect(mobileStore.workouts.getActive()).resolves.toBeNull();
});
