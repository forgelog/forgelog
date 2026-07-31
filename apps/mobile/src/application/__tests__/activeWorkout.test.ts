import { getDb, resetDbForTests } from '../../db/index';
import { mobileStore, runInMobileStoreTransaction } from '../../db/mobileStore';
import {
  addExerciseToWorkout,
  addSetToWorkout,
  completeSet,
  deleteExerciseFromWorkout,
  deleteSet,
  discardWorkout,
  finishWorkoutWithRoutineAction,
  getActiveWorkoutRecordEvents,
  getWorkoutFinishPlan,
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
}

async function startWeightedWorkout() {
  const { workout } = await startOrResumeWorkout();
  const exercise = await addExerciseToWorkout(workout.id, 'ex1');
  const set = await addSetToWorkout(exercise.id);
  return { workout, exercise, set };
}

async function finishBaseline(weight = 100, reps = 5) {
  const { workout, set } = await startWeightedWorkout();
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight, reps });
  await completeSet(set.id, 'ex1');
  await finishWorkoutWithRoutineAction(workout.id, { kind: 'finish-only' });
}

beforeEach(async () => {
  resetDbForTests();
  await insertExercise();
});

test('stale set and exercise callbacks are harmless after the active workout is gone', async () => {
  await expect(completeSet('missing-set', 'ex1')).resolves.toEqual({
    improvedRecords: [],
    recordEvents: [],
  });
  await expect(uncompleteSet('missing-set', 'ex1')).resolves.toBeUndefined();
  await expect(
    updateSetAndRecomputeRecords('missing-set', 'ex1', { weight: 100 })
  ).resolves.toEqual({ recordEvents: [] });
  await expect(deleteSet('missing-set', 'ex1')).resolves.toBeUndefined();
  await expect(deleteExerciseFromWorkout('missing-exercise', 'ex1')).resolves.toBeUndefined();
});

test('a default freestyle workout has an empty suggested finish name', async () => {
  const { workout } = await startOrResumeWorkout();

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'freestyle',
    suggestedName: '',
  });
});

test('a named freestyle workout suggests its current name at finish', async () => {
  const { workout } = await startOrResumeWorkout();
  await runInMobileStoreTransaction((store) =>
    store.workoutReplicas.updateName(workout.id, 'Evening session')
  );

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'freestyle',
    suggestedName: 'Evening session',
  });
});

test('active completion stays out of normalized PR tables until finish', async () => {
  const { workout, set } = await startWeightedWorkout();
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 100, reps: 5 });
  await completeSet(set.id, 'ex1');

  expect(await mobileStore.records.getForExercise('ex1')).toEqual([]);
  const db = await getDb();
  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 0 }
  );

  await finishWorkoutWithRoutineAction(workout.id, { kind: 'finish-only' });

  expect(await mobileStore.records.getForExercise('ex1')).toEqual(
    expect.arrayContaining([expect.objectContaining({ record_type: 'max_weight', value: 100 })])
  );
  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 1 }
  );
});

test('active PR feedback derives from finished baseline and alerts each type once', async () => {
  await finishBaseline();
  const { workout, exercise, set } = await startWeightedWorkout();
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 110, reps: 5 });

  const first = await completeSet(set.id, 'ex1');

  expect(first.recordEvents.map((event) => event.record_type)).toEqual(
    expect.arrayContaining(['max_weight', 'max_volume'])
  );
  expect(await getActiveWorkoutRecordEvents(workout.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ workout_exercise_id: exercise.id, logged_set_id: set.id }),
    ])
  );

  await uncompleteSet(set.id, 'ex1');
  expect(await getActiveWorkoutRecordEvents(workout.id)).toEqual([]);
  const second = await addSetToWorkout(exercise.id);
  await updateSetAndRecomputeRecords(second.id, 'ex1', { weight: 120, reps: 5 });
  expect((await completeSet(second.id, 'ex1')).recordEvents).toEqual([]);
});

test('active edits and deletes update the replica without touching history', async () => {
  await finishBaseline();
  const { workout, set } = await startWeightedWorkout();
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 130, reps: 3 });
  await completeSet(set.id, 'ex1');
  await deleteSet(set.id, 'ex1');

  expect((await mobileStore.workouts.getDetail(workout.id))?.exercises[0].sets).toEqual([]);
  expect(
    (await mobileStore.records.getForExercise('ex1')).find(
      (record) => record.record_type === 'max_weight'
    )?.value
  ).toBe(100);
  const db = await getDb();
  const row = await db.getFirstAsync<{ replica_json: string }>(
    'SELECT replica_json FROM workout_replica_state WHERE workout_id = $id',
    { $id: workout.id }
  );
  expect(row?.replica_json).toContain(`"id":"${set.id}","version"`);
  expect(row?.replica_json).toContain('"deleted":true');
});

test('discard creates a terminal fence and rejects a non-current workout', async () => {
  const { workout } = await startWeightedWorkout();

  await discardWorkout(workout.id);
  await expect(discardWorkout('missing-workout')).rejects.toThrow('Active workout not found');

  expect(await mobileStore.workouts.getActive()).toBeNull();
  const db = await getDb();
  expect(await db.getFirstAsync('SELECT state_kind FROM workout_replica_state WHERE workout_id = $id', {
    $id: workout.id,
  })).toEqual({ state_kind: 'discarded' });
});

test('startOrResumeWorkout returns the canonical active workout without normalized rows', async () => {
  const first = await startOrResumeWorkout();
  const second = await startOrResumeWorkout();

  expect(second).toEqual({ workout: first.workout, resumed: true });
  const db = await getDb();
  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 0 }
  );
});

test('routine target edits do not change structure but added sets do', async () => {
  const routine = await mobileStore.routines.saveDraft({
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
  const { workout } = await startOrResumeWorkout(routine.id);
  const detail = await mobileStore.workouts.getDetail(workout.id);
  const exercise = detail?.exercises[0];
  const set = exercise?.sets[0];
  if (!exercise || !set) throw new Error('Expected routine snapshot');
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 130, reps: 3, rpe: 9 });

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'routine-unchanged',
    routineName: 'Strength',
  });

  await addSetToWorkout(exercise.id);
  await expect(getWorkoutFinishPlan(workout.id)).resolves.toMatchObject({
    kind: 'routine-changed',
    routineName: 'Strength',
    changes: [{ kind: 'sets-added-or-removed' }],
  });
});

test('a workout falls back to freestyle finishing when its source routine was deleted', async () => {
  const routine = await mobileStore.routines.saveDraft({
    name: 'Temporary Routine',
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
  const { workout } = await startOrResumeWorkout(routine.id);
  await mobileStore.routines.remove(routine.id);

  await expect(getWorkoutFinishPlan(workout.id)).resolves.toEqual({
    kind: 'freestyle',
    suggestedName: 'Temporary Routine',
  });
});

test('finishing freestyle can create a structure-only routine', async () => {
  const { workout, set } = await startWeightedWorkout();
  await updateSetAndRecomputeRecords(set.id, 'ex1', { weight: 120, reps: 8 });
  await completeSet(set.id, 'ex1');

  const result = await finishWorkoutWithRoutineAction(workout.id, {
    kind: 'create-routine',
    name: 'Tuesday Strength',
  });

  expect(result).toMatchObject({ routineId: expect.any(String) });
  await expect(mobileStore.workouts.getDetail(workout.id)).resolves.toMatchObject({
    routine_id: null,
    ended_at: expect.any(String),
  });
  await expect(mobileStore.routines.getDetail(result.routineId as string)).resolves.toMatchObject({
    name: 'Tuesday Strength',
    exercises: [
      expect.objectContaining({
        exercise_id: 'ex1',
        sets: [expect.objectContaining({ target_weight: null, target_reps: null })],
      }),
    ],
  });
});

test('finishing with a routine update changes structure and preserves targets', async () => {
  const routine = await mobileStore.routines.saveDraft({
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
  const { workout } = await startOrResumeWorkout(routine.id);
  const detail = await mobileStore.workouts.getDetail(workout.id);
  const exercise = detail?.exercises[0];
  if (!exercise) throw new Error('Expected routine snapshot');
  await addSetToWorkout(exercise.id);

  await finishWorkoutWithRoutineAction(workout.id, { kind: 'update-routine' });

  await expect(mobileStore.routines.getDetail(routine.id)).resolves.toMatchObject({
    notes: 'Keep routine note',
    exercises: [
      expect.objectContaining({
        notes: 'Keep exercise note',
        sets: [
          expect.objectContaining({ target_weight: 100, target_reps: 5 }),
          expect.objectContaining({ target_weight: null, target_reps: null }),
        ],
      }),
    ],
  });
});

test('application transaction exposes canonical replica operations', async () => {
  await expect(
    runInMobileStoreTransaction((store) => store.workoutReplicas.getActive())
  ).resolves.toBeNull();
});
