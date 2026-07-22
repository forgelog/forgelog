import { getDb, resetDbForTests } from '../../index';
import {
  mobileStoreForTests as mobileStore,
  seededExercise,
  setWorkoutTimestamps,
} from '../../../test-utils/db';
import type { LoggedSet } from '../../types';

const { saveDraft: saveRoutineDraft } = mobileStore.routines;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
  getPreviousExerciseSets,
  listExerciseHistory,
  getDetail: getWorkoutDetail,
  hasCompletedSet,
  start: startWorkout,
  setSetCompletion,
  updateSetValues: updateLoggedSetValues,
} = mobileStore.workouts;

beforeEach(() => {
  resetDbForTests();
});

async function setCompletedAt(setId: string, completedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE logged_sets SET completed_at = $completedAt WHERE id = $id', {
    $completedAt: completedAt,
    $id: setId,
  });
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

test('hasCompletedSet is false for a workout with no exercises', () => {
  expect(hasCompletedSet([])).toBe(false);
});

test('hasCompletedSet is false when no set is completed', () => {
  expect(
    hasCompletedSet([{ sets: [{ completed: false }, { completed: false }] }, { sets: [] }])
  ).toBe(false);
});

test('hasCompletedSet is true when at least one set is completed', () => {
  expect(
    hasCompletedSet([
      { sets: [{ completed: false }] },
      { sets: [{ completed: false }, { completed: true }] },
    ])
  ).toBe(true);
});

test('starts from routines and reports detail, history, and previous sets', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await saveRoutineDraft({
    name: 'Strength A',
    notes: null,
    exercises: [
      {
        exercise_id: bench.id,
        exercise_type: 'weight_reps',
        notes: 'Snapshot this',
        sets: [
          {
            set_type: 'normal',
            target_weight: 100,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

  const firstWorkout = await startWorkout({ routineId: routine.id });
  const firstDetail = await getWorkoutDetail(firstWorkout.id);
  const firstSet = firstDetail?.exercises[0].sets[0] as LoggedSet;
  expect(firstDetail).toMatchObject({
    id: firstWorkout.id,
    routine_id: routine.id,
    name: 'Strength A',
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        exercise_type: 'weight_reps',
        source_routine_exercise_id: routine.exercises[0].id,
        notes: 'Snapshot this',
        sets: [
          expect.objectContaining({
            weight: 100,
            reps: 5,
            completed: false,
            source_routine_set_id: routine.exercises[0].sets[0].id,
          }),
        ],
      }),
    ],
  });
  await updateLoggedSetValues(firstSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(firstSet.id, true);
  await finishWorkout(firstWorkout.id);
  await setWorkoutTimestamps(
    firstWorkout.id,
    yesterday.toISOString(),
    addHours(yesterday, 1).toISOString()
  );
  await setCompletedAt(firstSet.id, addHours(yesterday, 0.25).toISOString());

  const secondWorkout = await startWorkout({ name: 'Follow-up' });
  const secondWorkoutExercise = await addExerciseToWorkout(secondWorkout.id, bench.id);
  const secondSet = await addSet(secondWorkoutExercise.id);
  await updateLoggedSetValues(secondSet.id, { weight: 80, reps: 3 });
  await setSetCompletion(secondSet.id, true);
  await finishWorkout(secondWorkout.id);
  await setWorkoutTimestamps(
    secondWorkout.id,
    today.toISOString(),
    addHours(today, 1).toISOString()
  );
  await setCompletedAt(secondSet.id, addHours(today, 0.25).toISOString());

  await expect(getPreviousExerciseSets(bench.id, secondWorkout.id)).resolves.toEqual([
    expect.objectContaining({ id: firstSet.id, weight: 100, reps: 5, completed: true }),
  ]);
  const history = await listExerciseHistory(bench.id);
  expect(history.map((entry) => entry.workoutId)).toEqual([secondWorkout.id, firstWorkout.id]);
  expect(history[0].sets).toEqual([
    expect.objectContaining({ id: secondSet.id, weight: 80, reps: 3, completed: true }),
  ]);
});

test('lists complete exercise history without an implicit limit', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');

  for (let index = 0; index < 21; index += 1) {
    const workout = await startWorkout({ name: `Workout ${index + 1}` });
    await addExerciseToWorkout(workout.id, bench.id);
    await finishWorkout(workout.id);
  }

  await expect(listExerciseHistory(bench.id)).resolves.toHaveLength(21);
});

test('completion changes preserve an existing timestamp until the set is uncompleted', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Timestamp test' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const set = await addSet(workoutExercise.id);
  const originalCompletedAt = '2026-01-01T10:00:00.000Z';
  const db = await getDb();

  await setSetCompletion(set.id, true);
  await db.runAsync('UPDATE logged_sets SET completed_at = $completedAt WHERE id = $id', {
    $completedAt: originalCompletedAt,
    $id: set.id,
  });
  await setSetCompletion(set.id, true);

  await expect(
    db.getFirstAsync<{ completed: number; completed_at: string | null }>(
      'SELECT completed, completed_at FROM logged_sets WHERE id = $id',
      { $id: set.id }
    )
  ).resolves.toEqual({ completed: 1, completed_at: originalCompletedAt });

  await setSetCompletion(set.id, false);
  await expect(
    db.getFirstAsync<{ completed: number; completed_at: string | null }>(
      'SELECT completed, completed_at FROM logged_sets WHERE id = $id',
      { $id: set.id }
    )
  ).resolves.toEqual({ completed: 0, completed_at: null });

  await setSetCompletion(set.id, true);
  const recompleted = await db.getFirstAsync<{ completed: number; completed_at: string | null }>(
    'SELECT completed, completed_at FROM logged_sets WHERE id = $id',
    { $id: set.id }
  );
  expect(recompleted?.completed).toBe(1);
  expect(recompleted?.completed_at).not.toBeNull();
  expect(recompleted?.completed_at).not.toBe(originalCompletedAt);
});
