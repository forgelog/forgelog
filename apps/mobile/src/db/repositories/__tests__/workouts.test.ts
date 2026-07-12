import { getDb, resetDbForTests } from '../../index';
import { seededExercise, setWorkoutTimestamps } from '../../../test-utils/db';
import type { LoggedSet } from '../../types';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
  updateRoutineExercise,
} from '../routines';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getPreviousSessionSets,
  getProfileStats,
  getSessionsForExercise,
  getWorkoutDetail,
  hasCompletedSet,
  startWorkout,
  updateLoggedSet,
} from '../workouts';

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
    hasCompletedSet([
      { sets: [{ completed: false }, { completed: false }] },
      { sets: [] },
    ])
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

test('starts from routines and reports detail, history, previous sets, and profile stats', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await createRoutine('Strength A');
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await updateRoutineExercise(routineExercise.id, {
    rest_seconds: 150,
    notes: 'Snapshot this',
  });
  await addRoutineSet(routineExercise.id, { target_weight: 100, target_reps: 5 });

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
        rest_seconds: 150,
        exercise_type: 'weight_reps',
        notes: 'Snapshot this',
        sets: [expect.objectContaining({ weight: 100, reps: 5, completed: false })],
      }),
    ],
  });
  await updateLoggedSet(firstSet.id, { weight: 100, reps: 5, completed: true });
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
  await updateLoggedSet(secondSet.id, { weight: 80, reps: 3, completed: true });
  await finishWorkout(secondWorkout.id);
  await setWorkoutTimestamps(
    secondWorkout.id,
    today.toISOString(),
    addHours(today, 1).toISOString()
  );
  await setCompletedAt(secondSet.id, addHours(today, 0.25).toISOString());

  await expect(getPreviousSessionSets(bench.id, secondWorkout.id)).resolves.toEqual([
    expect.objectContaining({ id: firstSet.id, weight: 100, reps: 5, completed: true }),
  ]);
  const sessions = await getSessionsForExercise(bench.id);
  expect(sessions.map((session) => session.workoutId)).toEqual([secondWorkout.id, firstWorkout.id]);
  expect(sessions[0].sets).toEqual([
    expect.objectContaining({ id: secondSet.id, weight: 80, reps: 3, completed: true }),
  ]);

  await expect(getProfileStats()).resolves.toEqual({
    workoutCount: 2,
    totalVolume: 740,
    streakDays: 2,
  });
});
