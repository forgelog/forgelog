import { getDb, resetDbForTests } from '../../index';
import {
  addExerciseToActiveReplica,
  addSetToActiveReplica,
  discardActiveWorkout,
  finishActiveWorkout,
  getActiveWorkoutFromReplica,
  getWorkoutDetailFromReplica,
  listAuthoredWorkoutReplicas,
  moveActiveExercise,
  saveAuthoredWorkoutReplica,
  setActiveSetCompletion,
  startActiveWorkoutReplica,
  updateActiveSetValues,
} from '../workoutReplicas';
import { seededExercise } from '../../../test-utils/db';

beforeEach(() => {
  resetDbForTests();
});

test('active workout lives only in canonical replica storage and survives reads', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { name: 'Replica workout', nowMs: 1000 });

  expect(await getActiveWorkoutFromReplica(db)).toMatchObject({
    id: workout.id,
    name: 'Replica workout',
    started_at: new Date(1000).toISOString(),
  });
  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 0 }
  );

  const mailbox = await db.getFirstAsync<{ desired_mailbox_json: string }>(
    'SELECT desired_mailbox_json FROM workout_mailbox_state WHERE id = 0'
  );
  expect(JSON.parse(mailbox?.desired_mailbox_json ?? '{}')).toMatchObject({
    protocol_version: 1,
    candidate: { workout_id: workout.id, state: { kind: 'active' } },
    watch_receipt: null,
  });
});

test('active exercise and set mutations persist as versioned replica entries', async () => {
  const db = await getDb();
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startActiveWorkoutReplica(db, { nowMs: 1000 });
  const exercise = await addExerciseToActiveReplica(db, workout.id, bench.id, 1001);
  const set = await addSetToActiveReplica(db, exercise.id, 'normal', 1002);

  await updateActiveSetValues(db, set.id, { weight: 100, reps: 5 }, 1003);
  await setActiveSetCompletion(db, set.id, true, 1004);

  const detail = await getWorkoutDetailFromReplica(db, workout.id);
  expect(detail).toMatchObject({
    id: workout.id,
    exercises: [
      {
        id: exercise.id,
        exercise_id: bench.id,
        exercise: { name: bench.name },
        sets: [{ id: set.id, weight: 100, reps: 5, completed: true }],
      },
    ],
  });
  expect(detail?.exercises[0].sets[0].completed_at).toBe(new Date(1004).toISOString());
});

test('moving exercises assigns dense positions when merged positions collide', async () => {
  const db = await getDb();
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Full Squat');
  const workout = await startActiveWorkoutReplica(db, { nowMs: 1000 });
  const first = await addExerciseToActiveReplica(db, workout.id, bench.id, 1001);
  await addExerciseToActiveReplica(db, workout.id, squat.id, 1002);
  const authored = (await listAuthoredWorkoutReplicas(db))[0];
  if (authored.replica.state.kind !== 'active') throw new Error('Expected active replica');
  await saveAuthoredWorkoutReplica(db, {
    ...authored,
    replica: {
      ...authored.replica,
      state: {
        kind: 'active',
        workout: {
          ...authored.replica.state.workout,
          exercises: authored.replica.state.workout.exercises.map((exercise) => ({
            ...exercise,
            id: exercise.id === first.id ? 'Z' : 'a',
            position: 0,
          })),
        },
      },
    },
  });

  await moveActiveExercise(db, 'Z', 1, 1003);

  const detail = await getWorkoutDetailFromReplica(db, workout.id);
  expect(detail?.exercises.map((exercise) => exercise.id)).toEqual(['a', 'Z']);
});

test('finishing atomically projects one immutable snapshot into normalized history', async () => {
  const db = await getDb();
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startActiveWorkoutReplica(db, { name: 'Finish me', nowMs: 1000 });
  const exercise = await addExerciseToActiveReplica(db, workout.id, bench.id, 1001);
  const set = await addSetToActiveReplica(db, exercise.id, 'normal', 1002);
  await updateActiveSetValues(db, set.id, { weight: 100, reps: 5 }, 1003);
  await setActiveSetCompletion(db, set.id, true, 1004);

  await finishActiveWorkout(db, workout.id, 2000);

  expect(await getActiveWorkoutFromReplica(db)).toBeNull();
  expect(await db.getFirstAsync('SELECT id, name, ended_at FROM workouts WHERE id = $id', {
    $id: workout.id,
  })).toEqual({ id: workout.id, name: 'Finish me', ended_at: new Date(2000).toISOString() });
  expect(await db.getFirstAsync<{ state_kind: string }>(
    'SELECT state_kind FROM workout_replica_state WHERE workout_id = $id',
    { $id: workout.id }
  )).toEqual({ state_kind: 'finished' });
});

test('finishing remains durable after the source routine is deleted', async () => {
  const db = await getDb();
  await db.runAsync("INSERT INTO routines (id, name) VALUES ('deleted-routine', 'Deleted Routine')");
  const workout = await startActiveWorkoutReplica(db, {
    routineId: 'deleted-routine',
    nowMs: 1000,
  });
  await db.runAsync("DELETE FROM routines WHERE id = 'deleted-routine'");

  await finishActiveWorkout(db, workout.id, 2000);

  expect(await db.getFirstAsync('SELECT routine_id FROM workouts WHERE id = $id', {
    $id: workout.id,
  })).toEqual({ routine_id: null });
});

test('terminal mutations reject an older hidden active generation', async () => {
  const db = await getDb();
  const workoutA = await startActiveWorkoutReplica(db, { name: 'A', nowMs: 1000 });
  const activeA = (await listAuthoredWorkoutReplicas(db))[0].replica;
  await saveAuthoredWorkoutReplica(db, {
    writer: 'watch',
    replica: {
      ...structuredClone(activeA),
      workout_id: 'newer-b',
      started_at_ms: 2000,
      changed_at_ms: 2000,
    },
  });

  await expect(finishActiveWorkout(db, workoutA.id, 2001)).rejects.toThrow(
    'Active workout not found'
  );
  await expect(discardActiveWorkout(db, workoutA.id, 2001)).rejects.toThrow(
    'Active workout not found'
  );
});

test('discarding leaves a terminal fence without creating history', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { nowMs: 1000 });

  await discardActiveWorkout(db, workout.id, 1001);

  expect(await getActiveWorkoutFromReplica(db)).toBeNull();
  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 0 }
  );
  expect(await db.getFirstAsync<{ state_kind: string }>(
    'SELECT state_kind FROM workout_replica_state WHERE workout_id = $id',
    { $id: workout.id }
  )).toEqual({ state_kind: 'discarded' });
});
