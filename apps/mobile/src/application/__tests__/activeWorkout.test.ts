import { getDb, resetDbForTests } from '../../db/index';
import { id } from '../../db/id';
import { mobileStoreForTests as mobileStore } from '../../test-utils/db';
import {
  completeSet,
  addExerciseToActiveWorkout,
  addSetToActiveWorkout,
  deleteExerciseFromWorkout,
  deleteSet,
  discardWorkout,
  finishWorkoutWithRoutineAction,
  getWorkoutFinishPlan,
  startOrResumeWorkout,
  uncompleteSet,
  updateSetAndRecomputeRecords,
} from '../activeWorkout';

const {
  getEventsForExercise: getRecordEventsForExercise,
  getForExercise: getRecordsForExercise,
  replaceForExercise: replaceRecordStateForExercise,
} = mobileStore.records;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  getDetail: getWorkoutDetail,
  setSetCompletion,
  start: startWorkout,
  updateSetValues: updateLoggedSetValues,
} = mobileStore.workouts;
const { getDetail: getRoutineDetail, saveDraft: saveRoutineDraft } = mobileStore.routines;

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
  await updateLoggedSetValues(set.id, { weight: 100, reps: 5 });
  await setSetCompletion(set.id, true);
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

test('editing a set created in a canonical active workout persists its value', async () => {
  const { workout } = await startOrResumeWorkout();
  const exercise = await addExerciseToActiveWorkout(workout.id, 'ex1');
  const set = await addSetToActiveWorkout(workout.id, exercise.id);

  await expect(updateSetAndRecomputeRecords(set.id, 'ex1', { reps: 12 })).resolves.toEqual({
    recordEvents: [],
  });
});

// ── replaceRecordsForExercise correctness ────────────────────────────────────

test('complete a weighted set → record exists; uncomplete it → record gone', async () => {
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 100, reps: 5 });

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
  await updateLoggedSetValues(s1.id, { weight: 100, reps: 5 });
  await updateLoggedSetValues(s2.id, { weight: 120, reps: 3 });

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
  await updateLoggedSetValues(set.id, { weight: 100, reps: 5 });
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
  await updateLoggedSetValues(s1.id, { weight: 100, reps: 5 });
  await updateLoggedSetValues(s2.id, { weight: 80, reps: 3 });

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
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });

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
  await updateLoggedSetValues(firstSet.id, { weight: 110, reps: 5 });
  await updateLoggedSetValues(laterSet.id, { weight: 120, reps: 5 });

  const first = await completeSet(firstSet.id, 'ex1');
  const second = await completeSet(laterSet.id, 'ex1');

  expect(first.recordEvents.map((event) => event.record_type)).toEqual(
    expect.arrayContaining(['max_weight', 'max_volume'])
  );
  expect(second.recordEvents).toEqual([]);
  expect(second.improvedRecords).toEqual([]);
  expect(await getRecordEventsForExercise('ex1')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        record_type: 'max_weight',
        value: 120,
        logged_set_id: laterSet.id,
      }),
      expect.objectContaining({
        record_type: 'max_volume',
        value: 600,
        logged_set_id: laterSet.id,
      }),
    ])
  );
});

test('uncompleteSet removes provisional events from an active workout', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');
  expect(
    (await getRecordEventsForExercise('ex1')).some((event) => event.logged_set_id === set.id)
  ).toBe(true);

  await uncompleteSet(set.id, 'ex1');

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect(
    (await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value
  ).toBe(100);
});

test('updating a completed set recomputes and removes stale events', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 90 });

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect(
    (await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value
  ).toBe(100);
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
  expect(
    (await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value
  ).toBe(100);
});

test('completeSet reports new events', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });

  const result = await completeSet(set.id, 'ex1');

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
    updateSetAndRecomputeRecords('missing-set', 'ex1', { weight: 110 })
  ).resolves.toEqual({ recordEvents: [] });
});

test('deleting a completed exercise removes its provisional contribution', async () => {
  await seedBaseline();
  const { weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await deleteExerciseFromWorkout(weId, 'ex1');

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect(
    (await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value
  ).toBe(100);
});

test('discarding an active workout removes provisional record events', async () => {
  await seedBaseline();
  const { workout, weId } = await insertWeightedWorkout();
  const set = await addSet(weId);
  await updateLoggedSetValues(set.id, { weight: 110, reps: 5 });
  await completeSet(set.id, 'ex1');

  await discardWorkout(workout.id);

  expect(await getRecordEventsForExercise('ex1')).toEqual([]);
  expect(
    (await getRecordsForExercise('ex1')).find((r) => r.record_type === 'max_weight')?.value
  ).toBe(100);
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

test('routine target values and workout-only fields do not make the finish plan changed', async () => {
  const routine = await saveRoutineDraft({
    name: 'Strength',
    notes: 'Routine note',
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: 'Exercise note',
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
  const workout = await startWorkout({ routineId: routine.id });
  const detail = await getWorkoutDetail(workout.id);
  const set = detail?.exercises[0].sets[0];
  if (!set) throw new Error('Expected copied routine set');
  await updateLoggedSetValues(set.id, { weight: 130, reps: 3, rpe: 9 });
  await setSetCompletion(set.id, true);

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'routine-unchanged',
    routineName: 'Strength',
  });
});

test('structural edits produce a routine-changed finish plan', async () => {
  const routine = await saveRoutineDraft({
    name: 'Strength',
    notes: null,
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
    ],
  });
  const workout = await startWorkout({ routineId: routine.id });
  const detail = await getWorkoutDetail(workout.id);
  if (!detail?.exercises[0]) throw new Error('Expected copied routine exercise');
  await addSet(detail.exercises[0].id, 'warmup');

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toMatchObject({
    kind: 'routine-changed',
    routineName: 'Strength',
    changes: [{ kind: 'sets-added-or-removed' }],
  });
});

test('legacy routine snapshots finish without offering an unsafe routine update', async () => {
  const routine = await saveRoutineDraft({
    name: 'Legacy Strength',
    notes: null,
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
    ],
  });
  const workout = await startWorkout({ routineId: routine.id });
  const detail = await getWorkoutDetail(workout.id);
  if (!detail?.exercises[0]) throw new Error('Expected routine snapshot');
  await addSet(detail.exercises[0].id);
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET routine_structure_version = NULL WHERE id = $id', {
    $id: workout.id,
  });

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'routine-update-unavailable',
    routineName: 'Legacy Strength',
  });
  await expect(
    finishWorkoutWithRoutineAction(workout.id, { kind: 'update-routine' })
  ).rejects.toThrow('Routine structure provenance unavailable');
});

test('finishing freestyle can create a structure-only routine without changing its origin', async () => {
  const workout = await startWorkout({ name: 'Workout' });
  const workoutExercise = await addExerciseToWorkout(workout.id, 'ex1');
  const set = await addSet(workoutExercise.id);
  await updateLoggedSetValues(set.id, { weight: 120, reps: 8 });
  await setSetCompletion(set.id, true);

  const result = await finishWorkoutWithRoutineAction(workout.id, {
    kind: 'create-routine',
    name: 'Tuesday Strength',
  });

  expect(result).toMatchObject({ routineId: expect.any(String) });
  await expect(getWorkoutDetail(workout.id)).resolves.toMatchObject({
    routine_id: null,
    ended_at: expect.any(String),
  });
  await expect(getRoutineDetail(result.routineId as string)).resolves.toMatchObject({
    name: 'Tuesday Strength',
    notes: null,
    exercises: [
      expect.objectContaining({
        exercise_id: 'ex1',
        notes: null,
        sets: [
          expect.objectContaining({
            set_type: 'normal',
            target_weight: null,
            target_reps: null,
          }),
        ],
      }),
    ],
  });
});

test('finishing with a routine update applies structure but preserves targets and notes', async () => {
  const routine = await saveRoutineDraft({
    name: 'Strength',
    notes: 'Keep routine note',
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: 'Keep exercise note',
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
  const workout = await startWorkout({ routineId: routine.id });
  const detail = await getWorkoutDetail(workout.id);
  const workoutExercise = detail?.exercises[0];
  const existingSet = workoutExercise?.sets[0];
  if (!workoutExercise || !existingSet) throw new Error('Expected routine snapshot');
  await updateLoggedSetValues(existingSet.id, { weight: 140, reps: 2 });
  await addSet(workoutExercise.id, 'dropset');

  await finishWorkoutWithRoutineAction(workout.id, { kind: 'update-routine' });

  await expect(getWorkoutDetail(workout.id)).resolves.toMatchObject({
    ended_at: expect.any(String),
  });
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    name: 'Strength',
    notes: 'Keep routine note',
    exercises: [
      expect.objectContaining({
        notes: 'Keep exercise note',
        sets: [
          expect.objectContaining({ target_weight: 100, target_reps: 5 }),
          expect.objectContaining({
            set_type: 'dropset',
            target_weight: null,
            target_reps: null,
          }),
        ],
      }),
    ],
  });
});
