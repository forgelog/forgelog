import { getDb, resetDbForTests } from '../../db/index';
import { id } from '../../db/id';
import {
  getRecordEventsForExercise,
  getRecordsForExercise,
  replaceRecordStateForExercise,
} from '../../db/repositories/personalRecords';
import { addSet, startWorkout, updateLoggedSet } from '../../db/repositories/workouts';
import {
  completeSet,
  deleteExerciseFromWorkout,
  deleteSet,
  discardWorkout,
  startOrResumeWorkout,
  uncompleteSet,
  updateSetAndRecomputeRecords,
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

async function seedBaseline(exerciseId = 'ex1') {
  const { workout, weId } = await insertWeightedWorkout(exerciseId);
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 100, reps: 5, completed: true });
  await replaceRecordStateForExercise(exerciseId);
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET ended_at = $ended WHERE id = $id', {
    $ended: '2026-07-01T11:00:00.000Z',
    $id: workout.id,
  });
  await db.runAsync('UPDATE workouts SET started_at = $started WHERE id = $id', {
    $started: '2026-07-01T10:00:00.000Z',
    $id: workout.id,
  });
  await db.runAsync('UPDATE logged_sets SET completed_at = $completed WHERE id = $id', {
    $completed: '2026-07-01T10:05:00.000Z',
    $id: set.id,
  });
  await replaceRecordStateForExercise(exerciseId);
  return set;
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
  expect(first.improvedRecords).toHaveLength(0);
  expect(first.recordEvents).toHaveLength(0);

  const second = await completeSet(s2.id, 'ex1');
  expect(second.improvedRecords).toHaveLength(0);
  expect(second.recordEvents).toHaveLength(0);
});

test('completeSet reports historical events only after baseline exists', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });

  const result = await completeSet(set.id, 'ex1');

  expect(result.recordEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 110, logged_set_id: set.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 550, logged_set_id: set.id }),
    ])
  );
});

test('completeSet reports each PR type at most once per exercise occurrence', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const firstSet = await addSet(weId);
  const laterSet = await addSet(weId);
  await updateLoggedSet(firstSet.id, { weight: 110, reps: 5 });
  await updateLoggedSet(laterSet.id, { weight: 120, reps: 5 });

  const first = await completeSet(firstSet.id, 'ex1');
  const second = await completeSet(laterSet.id, 'ex1');

  expect(first.recordEvents.map((event) => event.record_type)).toEqual(
    expect.arrayContaining(['max_weight', 'max_volume'])
  );
  expect(second.recordEvents).toEqual([]);
  expect(second.improvedRecords).toEqual([]);
  expect(await getRecordEventsForExercise('ex1')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 120, logged_set_id: laterSet.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 600, logged_set_id: laterSet.id }),
    ])
  );
});

test('uncompleteSet removes provisional events from an active workout', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');
  expect((await getRecordEventsForExercise('ex1')).some((event) => event.logged_set_id === set.id)).toBe(true);

  await uncompleteSet(set.id, 'ex1');

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect((await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('updating a completed set recomputes and removes stale events', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 90 });

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect((await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('updating an incomplete set persists values without recomputing PR state', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);

  const result = await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 130 });

  expect(result.recordEvents).toEqual([]);
  const db = await getDb();
  const row = await db.getFirstAsync<{ weight: number | null; completed: number }>(
    'SELECT weight, completed FROM logged_sets WHERE id = $id',
    { $id: set.id }
  );
  expect(row).toEqual({ weight: 130, completed: 0 });
  expect((await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('updateSetAndRecomputeRecords can complete a set and report new events', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });

  const result = await updateSetAndRecomputeRecords(set.id, 'ex1', { completed: true });

  expect(result.recordEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', logged_set_id: set.id }),
      expect.objectContaining({ record_type: 'max_volume', logged_set_id: set.id }),
    ])
  );
});

test('missing set mutations are no-ops for PR reporting', async () => {
  await seedBaseline();

  await expect(completeSet('missing-set', 'ex1')).resolves.toEqual({
    improvedRecords: [],
    recordEvents: [],
  });
  await expect(
    updateSetAndRecomputeRecords('missing-set', 'ex1', { completed: true })
  ).resolves.toEqual({ recordEvents: [] });
});

test('deleting a completed exercise removes its provisional contribution', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await deleteExerciseFromWorkout(weId, 'ex1');

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect((await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('discarding an active workout removes provisional record events', async () => {
  await seedBaseline();
  const { workout, weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSet(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await discardWorkout(workout.id);

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect((await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value).toBe(100);
});

test('discarding a missing workout is a no-op', async () => {
  await expect(discardWorkout('missing-workout')).resolves.toBeUndefined();
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
