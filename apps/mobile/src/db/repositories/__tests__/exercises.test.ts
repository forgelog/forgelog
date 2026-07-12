import { resetDbForTests } from '../../index';
import {
  createCustomExercise,
  listEquipment,
  listExercises,
  listMuscleGroups,
} from '../exercises';

beforeEach(() => {
  resetDbForTests();
});

test('searches, filters, and creates custom exercises on real SQL', async () => {
  const benchResults = await listExercises({ search: 'barbell bench press' });
  expect(benchResults.map((exercise) => exercise.name)).toContain('Barbell Bench Press - Medium Grip');

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

  const custom = await createCustomExercise({
    name: 'Cable Dragon Press',
    muscle_group: 'chest',
    equipment: 'cable',
    exercise_type: 'weight_reps',
    instructions: ['Brace hard.'],
  });

  expect(custom).toMatchObject({
    name: 'Cable Dragon Press',
    muscle_group: 'chest',
    equipment: 'cable',
    exercise_type: 'weight_reps',
    is_custom: true,
    instructions: ['Brace hard.'],
    images: [],
    secondary_muscles: [],
  });
  await expect(listExercises({ search: 'dragon' })).resolves.toEqual([custom]);
});
