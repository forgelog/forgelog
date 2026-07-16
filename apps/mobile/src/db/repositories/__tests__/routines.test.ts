import { getDb, resetDbForTests } from '../../index';
import { getRoutinesWithSummaries } from '../routines';
import { mobileStoreForTests as mobileStore, seededExercise } from '../../../test-utils/db';

const { start: startWorkout, getDetail: getWorkoutDetail } = mobileStore.workouts;
const {
  addExercise: addExerciseToRoutine,
  addSet: addRoutineSet,
  create: createRoutine,
  remove: deleteRoutine,
  removeSet: deleteRoutineSet,
  getDetail: getRoutineDetail,
  getWithSummaries: getRoutinesWithSummariesFromStore,
  removeExercise: removeRoutineExercise,
  reorderExercises: reorderRoutineExercises,
  saveDraft: saveRoutineDraft,
  update: updateRoutine,
  updateExercise: updateRoutineExercise,
  updateSet: updateRoutineSet,
} = mobileStore.routines;

beforeEach(() => {
  resetDbForTests();
});

test('persists CRUD, reorder, and target-set edits on real SQL', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine(' Push Day ', '  Heavy day  ');

  const benchEntry = await addExerciseToRoutine(routine.id, bench.id);
  const squatEntry = await addExerciseToRoutine(routine.id, squat.id);
  await updateRoutine(routine.id, { name: 'Upper Lower', notes: 'Updated notes' });
  await updateRoutineExercise(benchEntry.id, {
    superset_group_id: 'pair-a',
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
    superset_group_id: 'pair-a',
    exercise_type: 'weight_reps',
    notes: 'Pause first rep',
  });
  expect(detail?.exercises[1].sets).toEqual([
    expect.objectContaining({ id: workSet.id, position: 0, target_weight: 100, target_reps: 5 }),
    expect.objectContaining({
      id: warmupSet.id,
      position: 1,
      set_type: 'dropset',
      target_weight: 70,
      target_reps: 8,
    }),
  ]);

  await deleteRoutineSet(workSet.id);
  await removeRoutineExercise(squatEntry.id);
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    exercises: [
      expect.objectContaining({
        id: benchEntry.id,
        sets: [expect.objectContaining({ id: warmupSet.id })],
      }),
    ],
  });
  await expect(getRoutinesWithSummariesFromStore()).resolves.toEqual([
    expect.objectContaining({
      id: routine.id,
      exerciseCount: 1,
      exerciseNames: ['Barbell Bench Press - Medium Grip'],
    }),
  ]);

  await deleteRoutine(routine.id);
  await expect(getRoutineDetail(routine.id)).resolves.toBeNull();
});

test('saveRoutineDraft creates a complete routine atomically', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');

  const saved = await saveRoutineDraft({
    name: ' Push Day ',
    notes: '  Heavy day  ',
    exercises: [
      {
        exercise_id: bench.id,
        superset_group_id: 'pair-a',
        exercise_type: 'weight_reps',
        notes: 'Pause first rep',
        sets: [
          {
            set_type: 'normal',
            target_weight: 100,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
          {
            set_type: 'warmup',
            target_weight: 60,
            target_reps: 8,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
      {
        exercise_id: squat.id,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
    ],
  });

  expect(saved).toMatchObject({
    name: 'Push Day',
    notes: 'Heavy day',
    position: 0,
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        position: 0,
        superset_group_id: 'pair-a',
        exercise_type: 'weight_reps',
        notes: 'Pause first rep',
      }),
      expect.objectContaining({ exercise_id: squat.id, position: 1 }),
    ],
  });
  expect(saved.exercises[0].sets).toEqual([
    expect.objectContaining({
      position: 0,
      set_type: 'normal',
      target_weight: 100,
      target_reps: 5,
    }),
    expect.objectContaining({ position: 1, set_type: 'warmup', target_weight: 60, target_reps: 8 }),
  ]);
});

test('saveRoutineDraft updates an existing routine and replaces child content', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine('Original');
  const benchEntry = await addExerciseToRoutine(routine.id, bench.id);
  const squatEntry = await addExerciseToRoutine(routine.id, squat.id);
  const removedSet = await addRoutineSet(benchEntry.id, { target_weight: 80, target_reps: 8 });
  await addRoutineSet(squatEntry.id, { target_weight: 120, target_reps: 5 });

  const saved = await saveRoutineDraft({
    routineId: routine.id,
    name: ' Updated ',
    notes: null,
    exercises: [
      {
        exercise_id: squat.id,
        superset_group_id: 'kept-pair',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 140,
            target_reps: 3,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

  expect(saved.id).toBe(routine.id);
  expect(saved.name).toBe('Updated');
  expect(saved.exercises.map((entry) => entry.exercise_id)).toEqual([squat.id]);
  expect(saved.exercises[0]).toMatchObject({
    position: 0,
    superset_group_id: 'kept-pair',
  });
  expect(saved.exercises[0].sets).toEqual([
    expect.objectContaining({ position: 0, target_weight: 140, target_reps: 3 }),
  ]);
  expect(saved.exercises[0].id).not.toBe(squatEntry.id);

  const detail = await getRoutineDetail(routine.id);
  expect(detail?.exercises.some((entry) => entry.id === benchEntry.id)).toBe(false);
  expect(detail?.exercises[0].sets.some((set) => set.id === removedSet.id)).toBe(false);
});

test('saveRoutineDraft persists reordered exercises and sets with contiguous positions', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine('Order');

  const saved = await saveRoutineDraft({
    routineId: routine.id,
    name: 'Order',
    notes: '',
    exercises: [
      {
        exercise_id: squat.id,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
      {
        exercise_id: bench.id,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'warmup',
            target_weight: 40,
            target_reps: 10,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
          {
            set_type: 'normal',
            target_weight: 80,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

  expect(saved.notes).toBeNull();
  expect(saved.exercises.map((entry) => entry.position)).toEqual([0, 1]);
  expect(saved.exercises.map((entry) => entry.exercise_id)).toEqual([squat.id, bench.id]);
  expect(saved.exercises[1].sets.map((set) => set.position)).toEqual([0, 1]);
  expect(saved.exercises[1].sets.map((set) => set.set_type)).toEqual(['warmup', 'normal']);
});

test('saveRoutineDraft rejects invalid name and notes with existing validation messages', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');

  await expect(
    saveRoutineDraft({
      name: '   ',
      notes: null,
      exercises: [
        {
          exercise_id: bench.id,
          exercise_type: 'weight_reps',
          notes: null,
          sets: [],
        },
      ],
    })
  ).rejects.toThrow('Routine name is required.');

  await expect(
    saveRoutineDraft({
      name: 'Valid',
      notes: 'x'.repeat(1001),
      exercises: [
        {
          exercise_id: bench.id,
          exercise_type: 'weight_reps',
          notes: null,
          sets: [],
        },
      ],
    })
  ).rejects.toThrow('Notes must be 1000 characters or fewer.');

  await expect(
    saveRoutineDraft({
      name: 'Valid',
      notes: null,
      exercises: [],
    })
  ).rejects.toThrow('Add at least one exercise before saving.');
});

test('getRoutinesWithSummaries returns all summaries in one aggregate query', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine('Strength');
  await addExerciseToRoutine(routine.id, bench.id);
  await addExerciseToRoutine(routine.id, bench.id);
  await addExerciseToRoutine(routine.id, squat.id);
  const emptyRoutine = await createRoutine('Empty');

  const db = await getDb();
  const getAllAsync = jest.spyOn(db, 'getAllAsync');

  await expect(getRoutinesWithSummaries(db)).resolves.toEqual([
    expect.objectContaining({
      id: routine.id,
      exerciseCount: 3,
      exerciseNames: ['Barbell Bench Press - Medium Grip', 'Barbell Squat'],
    }),
    expect.objectContaining({
      id: emptyRoutine.id,
      exerciseCount: 0,
      exerciseNames: [],
    }),
  ]);
  expect(getAllAsync).toHaveBeenCalledTimes(1);
  getAllAsync.mockRestore();
});

test('getRoutinesWithSummaries orders distinct exercise names by routine position', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine('Strength');
  const firstBenchEntry = await addExerciseToRoutine(routine.id, bench.id);
  const squatEntry = await addExerciseToRoutine(routine.id, squat.id);
  const secondBenchEntry = await addExerciseToRoutine(routine.id, bench.id);

  await reorderRoutineExercises([squatEntry.id, firstBenchEntry.id, secondBenchEntry.id]);

  await expect(getRoutinesWithSummariesFromStore()).resolves.toEqual([
    expect.objectContaining({
      id: routine.id,
      exerciseNames: ['Barbell Squat', 'Barbell Bench Press - Medium Grip'],
    }),
  ]);
});

test('saveRoutineDraft rolls back when child insert fails', async () => {
  const before = await getRoutinesWithSummariesFromStore();

  await expect(
    saveRoutineDraft({
      name: 'Bad Child',
      notes: null,
      exercises: [
        {
          exercise_id: 'missing-exercise',
          superset_group_id: null,
          exercise_type: 'weight_reps',
          notes: null,
          sets: [],
        },
      ],
    })
  ).rejects.toThrow();

  await expect(getRoutinesWithSummariesFromStore()).resolves.toEqual(before);
});

test('saveRoutineDraft keeps existing workout history attached to the same routine id', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await createRoutine('Snapshot Source');
  const routineExercise = await addExerciseToRoutine(routine.id, bench.id);
  await addRoutineSet(routineExercise.id, { target_weight: 100, target_reps: 5 });
  const workout = await startWorkout({ routineId: routine.id });

  await saveRoutineDraft({
    routineId: routine.id,
    name: 'Edited Source',
    notes: null,
    exercises: [
      {
        exercise_id: squat.id,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 140,
            target_reps: 3,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });

  await expect(getWorkoutDetail(workout.id)).resolves.toMatchObject({
    routine_id: routine.id,
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        sets: [expect.objectContaining({ weight: 100, reps: 5 })],
      }),
    ],
  });
});
