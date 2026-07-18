import { getDb, resetDbForTests } from '../../index';
import { backfillPersonalRecordState } from '../../personalRecordState';
import { mobileStoreForTests as mobileStore, seededExercise } from '../../../test-utils/db';

const {
  getEventsForExercise: getRecordEventsForExercise,
  getForExercise: getRecordsForExercise,
  replaceForExercise: replaceRecordStateForExercise,
  replaceCurrentForExercise: replaceRecordsForExercise,
} = mobileStore.records;
const {
  addExercise: addExerciseToWorkout,
  addSet,
  finish: finishWorkout,
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

async function clearCompletedAt(setId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE logged_sets SET completed_at = NULL WHERE id = $id', {
    $id: setId,
  });
}

async function setWorkoutStartedAt(workoutId: string, startedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET started_at = $startedAt WHERE id = $id', {
    $startedAt: startedAt,
    $id: workoutId,
  });
}

test('bodyweight exercise calculations use the workout bodyweight snapshot', async () => {
  await mobileStore.profile.completeOnboarding({ name: 'Jordan', bodyweightKg: 80 });
  const pullUps = await seededExercise('Weighted Pull Ups');
  const workout = await startWorkout({ name: 'Weighted pull-ups' });
  const workoutExercise = await addExerciseToWorkout(workout.id, pullUps.id);
  const set = await addSet(workoutExercise.id);

  expect(workout.bodyweight_kg).toBe(80);

  await updateLoggedSetValues(set.id, { weight: 10, reps: 5 });
  await setSetCompletion(set.id, true);
  await finishWorkout(workout.id);
  await mobileStore.profile.update({ bodyweightKg: 100 });

  const records = await replaceRecordsForExercise(pullUps.id);

  expect(records).toEqual(
    expect.arrayContaining([expect.objectContaining({ record_type: 'max_volume', value: 450 })])
  );
});

test('replacement uses completed sets and earliest timing tie-breaks', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'PR session' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const laterTie = await addSet(workoutExercise.id);
  const earlierTie = await addSet(workoutExercise.id);
  const ignoredIncomplete = await addSet(workoutExercise.id);

  await updateLoggedSetValues(laterTie.id, { weight: 100, reps: 5 });
  await setSetCompletion(laterTie.id, true);
  await updateLoggedSetValues(earlierTie.id, { weight: 100, reps: 5 });
  await setSetCompletion(earlierTie.id, true);
  await updateLoggedSetValues(ignoredIncomplete.id, { weight: 200, reps: 1 });
  await finishWorkout(workout.id);
  await setCompletedAt(laterTie.id, '2026-07-11T10:00:00.000Z');
  await setCompletedAt(earlierTie.id, '2026-07-11T09:00:00.000Z');

  const records = await replaceRecordsForExercise(bench.id);

  expect(records).toHaveLength(3);
  expect(records.every((record) => record.logged_set_id === earlierTie.id)).toBe(true);
  await expect(getRecordsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        record_type: 'max_weight',
        value: 100,
        logged_set_id: earlierTie.id,
      }),
      expect.objectContaining({
        record_type: 'max_volume',
        value: 500,
        logged_set_id: earlierTie.id,
      }),
    ])
  );
});

test('replacement keeps completed sets eligible when completed_at is missing', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'Imported history' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const legacyCompleted = await addSet(workoutExercise.id);

  await updateLoggedSetValues(legacyCompleted.id, { weight: 100, reps: 5 });
  await setSetCompletion(legacyCompleted.id, true);
  await finishWorkout(workout.id);
  await clearCompletedAt(legacyCompleted.id);

  const records = await replaceRecordsForExercise(bench.id);

  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        record_type: 'max_weight',
        value: 100,
        logged_set_id: legacyCompleted.id,
      }),
      expect.objectContaining({
        record_type: 'max_volume',
        value: 500,
        logged_set_id: legacyCompleted.id,
      }),
    ])
  );
});

test('record state baselines first occurrence and writes later historical events', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const firstWorkout = await startWorkout({ name: 'Baseline' });
  const firstExercise = await addExerciseToWorkout(firstWorkout.id, bench.id);
  const firstSet = await addSet(firstExercise.id);
  await updateLoggedSetValues(firstSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(firstSet.id, true);
  await finishWorkout(firstWorkout.id);
  await setWorkoutStartedAt(firstWorkout.id, '2026-07-01T10:00:00.000Z');
  await setCompletedAt(firstSet.id, '2026-07-01T10:05:00.000Z');

  const secondWorkout = await startWorkout({ name: 'Improve' });
  const secondExercise = await addExerciseToWorkout(secondWorkout.id, bench.id);
  const ramp = await addSet(secondExercise.id);
  const top = await addSet(secondExercise.id);
  await updateLoggedSetValues(ramp.id, { weight: 105, reps: 3 });
  await setSetCompletion(ramp.id, true);
  await updateLoggedSetValues(top.id, { weight: 110, reps: 5 });
  await setSetCompletion(top.id, true);
  await finishWorkout(secondWorkout.id);
  await setWorkoutStartedAt(secondWorkout.id, '2026-07-08T10:00:00.000Z');
  await setCompletedAt(ramp.id, '2026-07-08T10:05:00.000Z');
  await setCompletedAt(top.id, '2026-07-08T10:08:00.000Z');

  const state = await replaceRecordStateForExercise(bench.id);

  expect(state.currentRecords).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 110, logged_set_id: top.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 550, logged_set_id: top.id }),
    ])
  );
  expect(state.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 110, logged_set_id: top.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 550, logged_set_id: top.id }),
    ])
  );
  expect(state.events.some((event) => event.logged_set_id === firstSet.id)).toBe(false);
  expect(state.events.some((event) => event.logged_set_id === ramp.id)).toBe(false);
  await expect(getRecordEventsForExercise(bench.id)).resolves.toHaveLength(state.events.length);
});

test('personal record backfill rebuilds current records and historical events', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const firstWorkout = await startWorkout({ name: 'Baseline' });
  const firstExercise = await addExerciseToWorkout(firstWorkout.id, bench.id);
  const firstSet = await addSet(firstExercise.id);
  await updateLoggedSetValues(firstSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(firstSet.id, true);
  await finishWorkout(firstWorkout.id);
  await setWorkoutStartedAt(firstWorkout.id, '2026-07-01T10:00:00.000Z');
  await setCompletedAt(firstSet.id, '2026-07-01T10:05:00.000Z');

  const secondWorkout = await startWorkout({ name: 'Improve' });
  const secondExercise = await addExerciseToWorkout(secondWorkout.id, bench.id);
  const top = await addSet(secondExercise.id);
  await updateLoggedSetValues(top.id, { weight: 110, reps: 5 });
  await setSetCompletion(top.id, true);
  await finishWorkout(secondWorkout.id);
  await setWorkoutStartedAt(secondWorkout.id, '2026-07-08T10:00:00.000Z');
  await setCompletedAt(top.id, '2026-07-08T10:05:00.000Z');

  const db = await getDb();
  await db.runAsync('DELETE FROM personal_records WHERE exercise_id = $id', { $id: bench.id });
  await db.runAsync('DELETE FROM personal_record_events WHERE exercise_id = $id', {
    $id: bench.id,
  });

  await backfillPersonalRecordState(db);

  await expect(getRecordsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 110, logged_set_id: top.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 550, logged_set_id: top.id }),
    ])
  );
  await expect(getRecordEventsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 110, logged_set_id: top.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 550, logged_set_id: top.id }),
    ])
  );
});

test('record state removes or moves events after completed set edits', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const firstWorkout = await startWorkout({ name: 'Baseline' });
  const firstExercise = await addExerciseToWorkout(firstWorkout.id, bench.id);
  const firstSet = await addSet(firstExercise.id);
  await updateLoggedSetValues(firstSet.id, { weight: 100, reps: 5 });
  await setSetCompletion(firstSet.id, true);
  await finishWorkout(firstWorkout.id);
  await setWorkoutStartedAt(firstWorkout.id, '2026-07-01T10:00:00.000Z');
  await setCompletedAt(firstSet.id, '2026-07-01T10:05:00.000Z');

  const secondWorkout = await startWorkout({ name: 'Improve' });
  const secondExercise = await addExerciseToWorkout(secondWorkout.id, bench.id);
  const top = await addSet(secondExercise.id);
  await updateLoggedSetValues(top.id, { weight: 110, reps: 5 });
  await setSetCompletion(top.id, true);
  await finishWorkout(secondWorkout.id);
  await setWorkoutStartedAt(secondWorkout.id, '2026-07-08T10:00:00.000Z');
  await setCompletedAt(top.id, '2026-07-08T10:05:00.000Z');

  await replaceRecordStateForExercise(bench.id);
  expect(
    (await getRecordEventsForExercise(bench.id)).some((event) => event.logged_set_id === top.id)
  ).toBe(true);

  await updateLoggedSetValues(top.id, { weight: 90, reps: 5 });
  await replaceRecordStateForExercise(bench.id);

  expect(await getRecordEventsForExercise(bench.id)).toEqual([]);
  await expect(getRecordsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        record_type: 'max_weight',
        value: 100,
        logged_set_id: firstSet.id,
      }),
    ])
  );
});
