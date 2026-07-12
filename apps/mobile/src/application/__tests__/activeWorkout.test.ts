import { getDb, resetDbForTests } from '../../db/index';
import { id } from '../../db/id';
import { getRecordsForExercise } from '../../db/repositories/personalRecords';
import { addSet, startWorkout, updateLoggedSet } from '../../db/repositories/workouts';
import {
  completeSet,
  deleteSet,
  discardWorkout,
  startOrResumeWorkout,
  uncompleteSet,
} from '../activeWorkout';

async function insertExercise(exerciseId = 'ex1') {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, equipment, exercise_type, is_custom)
     VALUES ($id, 'Squat', 'legs', 'barbell', 'weight_reps', 1)`,
    { $id: exerciseId }
  );
  return exerciseId;
}

async function insertWeightedWorkout(exerciseId = 'ex1') {
  const db = await getDb();
  const workout = await startWorkout({ name: 'Test' });
  const weId = id();
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, exercise_type)
     VALUES ($id, $workout_id, $exercise_id, 0, 'weight_reps')`,
    { $id: weId, $workout_id: workout.id, $exercise_id: exerciseId }
  );
  return { workout, weId };
}

beforeEach(async () => {
  resetDbForTests();
  await insertExercise();
});

// ── replaceRecordsForExercise correctness ────────────────────────────────────

test('complete a weighted set → record exists; uncomplete it → record gone', async () => {
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 100, reps: 5 });

  await completeSet(set.id, 'ex1');
  const after = await getRecordsForExercise('ex1');
  expect(after.some((r) => r.record_type === 'max_weight')).toBe(true);

  await uncompleteSet(set.id, 'ex1');
  const afterUndo = await getRecordsForExercise('ex1');
  expect(afterUndo.some((r) => r.record_type === 'max_weight')).toBe(false);
});

test('complete two sets, delete the heavier → max_weight drops', async () => {
  const { weId } = await insertWeightedWorkout();
  const s1 = await addSet(weId);
  const s2 = await addSet(weId);
  await updateLoggedSet(s1.id, { weight: 100, reps: 5 });
  await updateLoggedSet(s2.id, { weight: 120, reps: 3 });

  await completeSet(s1.id, 'ex1');
  await completeSet(s2.id, 'ex1');

  const before = await getRecordsForExercise('ex1');
  expect(before.find((r) => r.record_type === 'max_weight')?.value).toBe(120);

  await deleteSet(s2.id, 'ex1');
  const after = await getRecordsForExercise('ex1');
  expect(after.find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('discard a workout → its contribution to records disappears', async () => {
  const { workout, weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 100, reps: 5 });
  await completeSet(set.id, 'ex1');

  const before = await getRecordsForExercise('ex1');
  expect(before.some((r) => r.record_type === 'max_weight')).toBe(true);

  await discardWorkout(workout.id);
  const after = await getRecordsForExercise('ex1');
  expect(after.some((r) => r.record_type === 'max_weight')).toBe(false);
});

test('completeSet returns improved records only when a record actually improved', async () => {
  const { weId } = await insertWeightedWorkout();
  const s1 = await addSet(weId);
  const s2 = await addSet(weId);
  await updateLoggedSet(s1.id, { weight: 100, reps: 5 });
  await updateLoggedSet(s2.id, { weight: 80, reps: 3 });

  const first = await completeSet(s1.id, 'ex1');
  expect(first.improvedRecords.length).toBeGreaterThan(0);

  const second = await completeSet(s2.id, 'ex1');
    expect(second.improvedRecords).toHaveLength(0);
});

// ── startOrResumeWorkout ──────────────────────────────────────────────────────

test('startOrResumeWorkout twice → same workout id', async () => {
  const first = await startOrResumeWorkout();
  const second = await startOrResumeWorkout();
  expect(second.workout.id).toBe(first.workout.id);
  expect(second.resumed).toBe(true);
});

test('startOrResumeWorkout with an active workout → returns active, no new row', async () => {
  const existing = await startWorkout({ name: 'Existing' });
  const { workout, resumed } = await startOrResumeWorkout();
  expect(workout.id).toBe(existing.id);
  expect(resumed).toBe(true);

  const db = await getDb();
  const count = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workouts WHERE ended_at IS NULL'
  );
  expect(count?.n).toBe(1);
});
