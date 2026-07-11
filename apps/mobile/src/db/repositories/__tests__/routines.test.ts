import { resetDbForTests } from '../../index';
import { seededExercise } from '../../../test-utils/db';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  deleteRoutine,
  deleteRoutineSet,
  getRoutineDetail,
  listRoutineSummaries,
  removeRoutineExercise,
  reorderRoutineExercises,
  updateRoutine,
  updateRoutineExercise,
  updateRoutineSet,
} from '../routines';

beforeEach(() => {
  resetDbForTests();
});

test('persists CRUD, reorder, and target-set edits on real SQL', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine(' Push Day ', '  Heavy day  ');

  const benchEntry = await addExerciseToRoutine(routine.id, bench.id);
  const squatEntry = await addExerciseToRoutine(routine.id, squat.id);
  await updateRoutine(routine.id, { name: 'Upper Lower', notes: 'Updated notes' });
  await updateRoutineExercise(benchEntry.id, {
    rest_seconds: 120,
    superset_group_id: 'pair-a',
    tracking_type: 'weight_reps',
    notes: 'Pause first rep',
  });
  const workSet = await addRoutineSet(benchEntry.id, {
    target_weight: 100,
    target_reps: 5,
  });
  const warmupSet = await addRoutineSet(benchEntry.id, {
    set_type: 'warmup',
    target_weight: 60,
    target_reps: 5,
  });
  await updateRoutineSet(warmupSet.id, {
    set_type: 'dropset',
    target_weight: 70,
    target_reps: 8,
    target_duration_seconds: null,
  });
  await reorderRoutineExercises([squatEntry.id, benchEntry.id]);

  const detail = await getRoutineDetail(routine.id);
  expect(detail?.name).toBe('Upper Lower');
  expect(detail?.notes).toBe('Updated notes');
  expect(detail?.exercises.map((entry) => entry.id)).toEqual([squatEntry.id, benchEntry.id]);
  expect(detail?.exercises[0].position).toBe(0);
  expect(detail?.exercises[1]).toMatchObject({
    id: benchEntry.id,
    position: 1,
    rest_seconds: 120,
    superset_group_id: 'pair-a',
    tracking_type: 'weight_reps',
    notes: 'Pause first rep',
  });
  expect(detail?.exercises[1].sets).toEqual([
    expect.objectContaining({ id: workSet.id, position: 0, target_weight: 100, target_reps: 5 }),
    expect.objectContaining({ id: warmupSet.id, position: 1, set_type: 'dropset', target_weight: 70, target_reps: 8 }),
  ]);

  await deleteRoutineSet(workSet.id);
  await removeRoutineExercise(squatEntry.id);
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    exercises: [expect.objectContaining({ id: benchEntry.id, sets: [expect.objectContaining({ id: warmupSet.id })] })],
  });
  await expect(listRoutineSummaries()).resolves.toEqual([
    expect.objectContaining({ id: routine.id, exerciseCount: 1, muscles: ['chest'] }),
  ]);

  await deleteRoutine(routine.id);
  await expect(getRoutineDetail(routine.id)).resolves.toBeNull();
});
