import { resetDbForTests } from '../../index';
import { mobileStore } from '../../mobileStore';

const {
  listEquipment,
  list: listExercises,
  listMuscleGroups,
} = mobileStore.exercises;

beforeEach(() => {
  resetDbForTests();
});

test('searches and filters seeded exercises on real SQL', async () => {
  const benchResults = await listExercises({ search: 'barbell bench press' });
  expect(benchResults.map((exercise) => exercise.name)).toContain(
    'Barbell Bench Press - Medium Grip'
  );

  const chestBarbellResults = await listExercises({
    muscleGroup: 'chest',
    equipment: 'barbell',
    search: 'bench',
  });
  expect(chestBarbellResults.length).toBeGreaterThan(0);
  expect(chestBarbellResults.every((exercise) => exercise.muscle_group === 'chest')).toBe(true);
  expect(chestBarbellResults.every((exercise) => exercise.equipment === 'barbell')).toBe(true);

  await expect(listMuscleGroups()).resolves.toContain('chest');
  await expect(listEquipment()).resolves.toContain('barbell');
});
