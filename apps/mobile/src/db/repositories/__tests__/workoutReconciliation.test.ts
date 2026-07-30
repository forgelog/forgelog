import { getDb, resetDbForTests } from '../../index';
import {
  materializeActiveWorkout,
  type WorkoutBody,
  type WorkoutMailbox,
  type WorkoutReplica,
} from '../../../domain/workoutReplicaSync';
import { seededExercise } from '../../../test-utils/db';
import { applyWatchWorkoutMailbox } from '../workoutReconciliation';
import { listExercises } from '../exercises';
import {
  getDesiredPhoneMailbox,
  getActiveWorkoutFromReplica,
  getWorkoutDetailFromReplica,
  finishActiveWorkout,
  listAuthoredWorkoutReplicas,
  saveAuthoredWorkoutReplica,
  startActiveWorkoutReplica,
  updateActiveWorkoutName,
} from '../workoutReplicas';

beforeEach(() => {
  resetDbForTests();
});

function watchMailbox(candidate: WorkoutReplica | null): WorkoutMailbox {
  return { protocol_version: 1, candidate, watch_receipt: null };
}

function single<T>(values: T[]): T {
  if (values.length !== 1) throw new Error(`Expected one item, got ${values.length}`);
  return values[0];
}

test('independent active edits join and create one local transport candidate', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { name: 'Base', nowMs: 1000 });
  const base = single(await listAuthoredWorkoutReplicas(db)).replica;
  await updateActiveWorkoutName(db, workout.id, 'Phone name', 1001);
  const watch = structuredClone(base);
  if (watch.state.kind !== 'active') throw new Error('Expected active fixture');
  watch.changed_at_ms = 1002;
  watch.state.workout.fields.notes = {
    version: { changed_at_ms: 1002, writer: 'watch' },
    value: 'Watch note',
  };

  await applyWatchWorkoutMailbox(db, watchMailbox(watch), 1003);

  await expect(getWorkoutDetailFromReplica(db, workout.id)).resolves.toMatchObject({
    name: 'Phone name',
    notes: 'Watch note',
  });
  const desired = await getDesiredPhoneMailbox(db);
  expect(desired.candidate).toMatchObject({
    workout_id: workout.id,
    changed_at_ms: 1003,
    state: { kind: 'active' },
  });
});

test('joining a late older workout preserves a newer workout transport intent', async () => {
  const db = await getDb();
  const workoutA = await startActiveWorkoutReplica(db, { name: 'A', nowMs: 1000 });
  const baseA = single(await listAuthoredWorkoutReplicas(db)).replica;
  await updateActiveWorkoutName(db, workoutA.id, 'Phone A', 1001);
  const workoutB: WorkoutReplica = {
    ...structuredClone(baseA),
    workout_id: 'workout-b',
    started_at_ms: 2000,
    changed_at_ms: 2000,
  };
  await saveAuthoredWorkoutReplica(db, { writer: 'watch', replica: workoutB });
  await updateActiveWorkoutName(db, workoutB.workout_id, 'Phone B', 2001);
  const watchA = structuredClone(baseA);
  if (watchA.state.kind !== 'active') throw new Error('Expected active fixture');
  watchA.changed_at_ms = 1002;
  watchA.state.workout.fields.notes = {
    version: { changed_at_ms: 1002, writer: 'watch' },
    value: 'Late watch note',
  };

  await applyWatchWorkoutMailbox(db, watchMailbox(watchA), 2002);

  expect((await getDesiredPhoneMailbox(db)).candidate?.workout_id).toBe(workoutB.workout_id);
  await expect(getWorkoutDetailFromReplica(db, workoutA.id)).resolves.toMatchObject({
    name: 'Phone A',
    notes: 'Late watch note',
  });
});

test('watch finish is durable before its exact receipt is exposed and replay is idempotent', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { name: 'Watch finish', nowMs: 1000 });
  const active = single(await listAuthoredWorkoutReplicas(db)).replica;
  if (active.state.kind !== 'active') throw new Error('Expected active fixture');
  const finished: WorkoutReplica = {
    ...active,
    changed_at_ms: 1100,
    state: {
      kind: 'finished',
      ended_at_ms: 1100,
      workout: materializeActiveWorkout(active.state.workout),
    },
  };

  await applyWatchWorkoutMailbox(db, watchMailbox(finished), 1200);
  await applyWatchWorkoutMailbox(db, watchMailbox(finished), 1201);

  expect(await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts')).toEqual(
    { count: 1 }
  );
  expect(await getDesiredPhoneMailbox(db)).toMatchObject({
    watch_receipt: {
      workout_id: workout.id,
      watch_started_at_ms: 1000,
      watch_changed_at_ms: 1100,
    },
  });

  await applyWatchWorkoutMailbox(db, watchMailbox(null), 1202);
  expect((await getDesiredPhoneMailbox(db)).watch_receipt).toBeNull();
});

test('watch finish projects without pre-existing exercise reference data', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { name: 'Reference-free', nowMs: 1000 });
  const active = single(await listAuthoredWorkoutReplicas(db)).replica;
  const body: WorkoutBody = {
    routine_id: null,
    routine_structure_version: null,
    name: 'Reference-free',
    notes: null,
    bodyweight_kg: null,
    exercises: [
      {
        id: 'watch-exercise',
        exercise_id: 'missing-exercise',
        exercise_name: 'Offline Exercise',
        source_routine_exercise_id: null,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
    ],
  };
  const finished: WorkoutReplica = {
    workout_id: workout.id,
    started_at_ms: active.started_at_ms,
    changed_at_ms: 1100,
    state: { kind: 'finished', ended_at_ms: 1100, workout: body },
  };

  await applyWatchWorkoutMailbox(db, watchMailbox(finished), 1200);

  await expect(getWorkoutDetailFromReplica(db, workout.id)).resolves.toMatchObject({
    exercises: [{ exercise: { id: 'missing-exercise', name: 'Offline Exercise' } }],
  });
  expect((await listExercises(db)).map((exercise) => exercise.id)).not.toContain(
    'missing-exercise'
  );
  expect((await getDesiredPhoneMailbox(db)).watch_receipt?.workout_id).toBe(workout.id);
});

test('a malformed candidate is ignored without modifying committed state', async () => {
  const db = await getDb();
  const workout = await startActiveWorkoutReplica(db, { nowMs: 1000 });
  const before = await listAuthoredWorkoutReplicas(db);

  await applyWatchWorkoutMailbox(
    db,
    { protocol_version: 1, candidate: { invalid: true }, watch_receipt: null } as unknown,
    1001
  );

  expect(await listAuthoredWorkoutReplicas(db)).toEqual(before);
  expect((await getDesiredPhoneMailbox(db)).candidate?.workout_id).toBe(workout.id);
});

test('a losing watch finish is receipted after the winning phone finish is durable while B stays active', async () => {
  const db = await getDb();
  const workoutA = await startActiveWorkoutReplica(db, { name: 'A', nowMs: 1000 });
  const activeA = single(await listAuthoredWorkoutReplicas(db)).replica;
  if (activeA.state.kind !== 'active') throw new Error('Expected active fixture');
  const watchFinish: WorkoutReplica = {
    ...activeA,
    changed_at_ms: 1100,
    state: {
      kind: 'finished',
      ended_at_ms: 1100,
      workout: { ...materializeActiveWorkout(activeA.state.workout), name: 'Watch final' },
    },
  };
  await finishActiveWorkout(db, workoutA.id, 1200);
  const workoutB = await startActiveWorkoutReplica(db, { name: 'B', nowMs: 1300 });

  await applyWatchWorkoutMailbox(db, watchMailbox(watchFinish), 1400);

  await expect(getActiveWorkoutFromReplica(db)).resolves.toMatchObject({ id: workoutB.id, name: 'B' });
  await expect(getWorkoutDetailFromReplica(db, workoutA.id)).resolves.toMatchObject({
    id: workoutA.id,
    name: 'A',
  });
  expect(await getDesiredPhoneMailbox(db)).toMatchObject({
    watch_receipt: {
      workout_id: workoutA.id,
      watch_started_at_ms: 1000,
      watch_changed_at_ms: 1100,
    },
  });
});

test('a later winning finish replaces the normalized history tree as one snapshot', async () => {
  const db = await getDb();
  const exercise = await seededExercise('Barbell Bench Press - Medium Grip');
  const workout = await startActiveWorkoutReplica(db, { name: 'Base', nowMs: 1000 });
  const active = single(await listAuthoredWorkoutReplicas(db)).replica;
  const firstBody: WorkoutBody = {
    routine_id: null,
    routine_structure_version: null,
    name: 'First finish',
    notes: null,
    bodyweight_kg: null,
    exercises: [
      {
        id: 'finished-exercise',
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        source_routine_exercise_id: null,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            id: 'first-set',
            source_routine_set_id: null,
            set_type: 'normal',
            weight: 60,
            reps: 8,
            duration_seconds: null,
            distance_meters: null,
            rpe: null,
            completed: true,
            completed_at_ms: 1050,
          },
        ],
      },
    ],
  };
  const secondBody: WorkoutBody = {
    ...firstBody,
    name: 'Second finish',
    exercises: [
      {
        ...firstBody.exercises[0],
        sets: [
          {
            ...firstBody.exercises[0].sets[0],
            id: 'second-set',
            weight: 80,
            reps: 5,
            completed_at_ms: 1150,
          },
        ],
      },
    ],
  };
  const first: WorkoutReplica = {
    workout_id: workout.id,
    started_at_ms: active.started_at_ms,
    changed_at_ms: 1100,
    state: { kind: 'finished', ended_at_ms: 1100, workout: firstBody },
  };
  const second: WorkoutReplica = {
    ...first,
    changed_at_ms: 1200,
    state: { kind: 'finished', ended_at_ms: 1200, workout: secondBody },
  };

  await applyWatchWorkoutMailbox(db, watchMailbox(first), 1300);
  await applyWatchWorkoutMailbox(db, watchMailbox(second), 1400);

  await expect(getWorkoutDetailFromReplica(db, workout.id)).resolves.toMatchObject({
    name: 'Second finish',
    exercises: [{ sets: [{ id: 'second-set', weight: 80, reps: 5 }] }],
  });
  expect(
    await db.getAllAsync<{ id: string }>(
      `SELECT ls.id FROM logged_sets ls
       JOIN workout_exercises we ON we.id = ls.workout_exercise_id
       WHERE we.workout_id = $id`,
      { $id: workout.id }
    )
  ).toEqual([{ id: 'second-set' }]);
});
