import Ajv from 'ajv';

import { getDb, resetDbForTests } from '../../index';
import type { Exercise, LoggedSet } from '../../types';
import {
  createCustomExercise,
  listEquipment,
  listExercises,
  listMuscleGroups,
} from '../exercises';
import { getRecordsForExercise, replaceRecordsForExercise } from '../personalRecords';
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
import { getSyncSnapshot, ingestWatchWorkout, type WatchWorkoutPayload } from '../sync';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getPreviousSessionSets,
  getProfileStats,
  getSessionsForExercise,
  getWorkoutDetail,
  startWorkout,
  updateLoggedSet,
} from '../workouts';

const contractSchema = require('../../../../../../data/contracts/sync.schema.json');

const ajv = new Ajv();
const validateSyncSnapshot = ajv.compile({
  ...contractSchema.definitions.SyncSnapshot,
  definitions: contractSchema.definitions,
});

beforeEach(() => {
  resetDbForTests();
});

async function seededExercise(search: string): Promise<Exercise> {
  const exercise = (await listExercises({ search })).find((candidate) => candidate.name === search);
  if (!exercise) throw new Error(`Missing seed exercise: ${search}`);
  return exercise;
}

async function setWorkoutTimestamps(workoutId: string, startedAt: string, endedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE workouts SET started_at = $started, ended_at = $ended WHERE id = $id', {
    $started: startedAt,
    $ended: endedAt,
    $id: workoutId,
  });
}

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

async function rowCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const tables = ['workouts', 'workout_exercises', 'logged_sets', 'personal_records'];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = row?.count ?? 0;
  }
  return counts;
}

async function personalRecordRows(): Promise<
  {
    id: string;
    exercise_id: string;
    record_type: string;
    value: number;
    logged_set_id: string | null;
    achieved_at: string;
  }[]
> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT id, exercise_id, record_type, value, logged_set_id, achieved_at
       FROM personal_records
      ORDER BY exercise_id, record_type`
  );
}

test('exercises repository searches, filters, and creates custom exercises on real SQL', async () => {
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
    tracking_type: 'weight_reps',
    instructions: ['Brace hard.'],
  });

  expect(custom).toMatchObject({
    name: 'Cable Dragon Press',
    muscle_group: 'chest',
    equipment: 'cable',
    tracking_type: 'weight_reps',
    is_custom: true,
    instructions: ['Brace hard.'],
    images: [],
    secondary_muscles: [],
  });
  await expect(listExercises({ search: 'dragon' })).resolves.toEqual([custom]);
});

test('routines repository persists CRUD, reorder, and target-set edits on real SQL', async () => {
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

test('workouts repository starts from routines and reports detail, history, previous sets, and profile stats', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await createRoutine('Strength A');
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await updateRoutineExercise(routineExercise.id, {
    rest_seconds: 150,
    tracking_type: 'weight_reps',
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
        tracking_type: 'weight_reps',
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

test('personal record replacement uses completed sets and earliest timing tie-breaks', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startWorkout({ name: 'PR session' });
  const workoutExercise = await addExerciseToWorkout(workout.id, bench.id);
  const laterTie = await addSet(workoutExercise.id);
  const earlierTie = await addSet(workoutExercise.id);
  const ignoredIncomplete = await addSet(workoutExercise.id);

  await updateLoggedSet(laterTie.id, { weight: 100, reps: 5, completed: true });
  await updateLoggedSet(earlierTie.id, { weight: 100, reps: 5, completed: true });
  await updateLoggedSet(ignoredIncomplete.id, { weight: 200, reps: 1, completed: false });
  await finishWorkout(workout.id);
  await setCompletedAt(laterTie.id, '2026-07-11T10:00:00.000Z');
  await setCompletedAt(earlierTie.id, '2026-07-11T09:00:00.000Z');

  const records = await replaceRecordsForExercise(bench.id);

  expect(records).toHaveLength(4);
  expect(records.every((record) => record.logged_set_id === earlierTie.id)).toBe(true);
  await expect(getRecordsForExercise(bench.id)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record_type: 'max_weight', value: 100, logged_set_id: earlierTie.id }),
      expect.objectContaining({ record_type: 'max_reps', value: 5, logged_set_id: earlierTie.id }),
      expect.objectContaining({ record_type: 'max_volume', value: 500, logged_set_id: earlierTie.id }),
    ])
  );
});

test('sync repository snapshots validate and duplicate watch deliveries keep row counts stable', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const routine = await createRoutine('Watch Push');
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await updateRoutineExercise(routineExercise.id, { rest_seconds: 90, tracking_type: 'weight_reps' });
  await addRoutineSet(routineExercise.id, { target_weight: 60, target_reps: 8 });

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO personal_records (id, exercise_id, record_type, value, logged_set_id, achieved_at)
     VALUES ('manual-pr', $exerciseId, 'max_weight', 62.5, NULL, '2026-01-01T00:00:00.000Z')`,
    { $exerciseId: bench.id }
  );

  const snapshot = await getSyncSnapshot();
  expect(validateSyncSnapshot(snapshot)).toBe(true);
  expect(validateSyncSnapshot.errors).toBeNull();

  const payload: WatchWorkoutPayload = {
    protocol_version: 1,
    id: 'watch-workout-1',
    routine_id: null,
    name: 'Watch Push',
    started_at: '2026-07-11T08:00:00.000Z',
    ended_at: '2026-07-11T08:45:00.000Z',
    notes: null,
    exercises: [
      {
        id: 'watch-workout-exercise-1',
        exercise_id: bench.id,
        position: 0,
        superset_group_id: null,
        tracking_type: 'weight_reps',
        rest_seconds: 90,
        notes: null,
        sets: [
          {
            id: 'watch-logged-set-1',
            workout_exercise_id: 'watch-workout-exercise-1',
            position: 0,
            set_type: 'normal',
            weight: 70,
            reps: 5,
            duration_seconds: null,
            distance_meters: null,
            rpe: 8,
            completed: true,
            completed_at: '2026-07-11T08:10:00.000Z',
          },
        ],
      },
    ],
  };

  await ingestWatchWorkout(payload);
  const firstCounts = await rowCounts();
  const firstPersonalRecords = await personalRecordRows();
  await ingestWatchWorkout(payload);

  await expect(rowCounts()).resolves.toEqual(firstCounts);
  await expect(personalRecordRows()).resolves.toEqual(firstPersonalRecords);
  await expect(getWorkoutDetail(payload.id)).resolves.toMatchObject({
    id: payload.id,
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        sets: [expect.objectContaining({ id: 'watch-logged-set-1', weight: 70, reps: 5 })],
      }),
    ],
  });
});
