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
