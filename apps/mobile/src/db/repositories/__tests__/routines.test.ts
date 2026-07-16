import { getDb, resetDbForTests } from '../../index';
import { getRoutinesWithSummaries } from '../routines';
import { mobileStoreForTests as mobileStore, seededExercise } from '../../../test-utils/db';

const { start: startWorkout, getDetail: getWorkoutDetail } = mobileStore.workouts;
const {
  getDetail: getRoutineDetail,
  getWithSummaries: getRoutinesWithSummariesFromStore,
  saveDraft: saveRoutineDraft,
} = mobileStore.routines;

beforeEach(() => {
  resetDbForTests();
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
      expect.objectContaining({ exercise_id: bench.id, position: 0, superset_group_id: 'pair-a' }),
      expect.objectContaining({ exercise_id: squat.id, position: 1 }),
    ],
  });
  expect(saved.exercises[0].sets).toEqual([
    expect.objectContaining({ position: 0, target_weight: 100, target_reps: 5 }),
  ]);
});

test('saveRoutineDraft updates child content without changing workout history', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const original = await saveRoutineDraft({
    name: 'Snapshot Source',
    notes: null,
    exercises: [
      {
        exercise_id: bench.id,
        exercise_type: 'weight_reps',
        notes: 'Snapshot this',
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
  const workout = await startWorkout({ routineId: original.id });

  const saved = await saveRoutineDraft({
    routineId: original.id,
    name: ' Updated ',
    notes: null,
    exercises: [
      {
        exercise_id: squat.id,
        superset_group_id: 'kept-pair',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [],
      },
    ],
  });

  expect(saved).toMatchObject({
    id: original.id,
    name: 'Updated',
    exercises: [expect.objectContaining({ exercise_id: squat.id, position: 0 })],
  });
  await expect(getRoutineDetail(original.id)).resolves.toMatchObject({
    exercises: [expect.objectContaining({ exercise_id: squat.id })],
  });
  await expect(getWorkoutDetail(workout.id)).resolves.toMatchObject({
    routine_id: original.id,
    exercises: [
      expect.objectContaining({
        exercise_id: bench.id,
        notes: 'Snapshot this',
        sets: [expect.objectContaining({ weight: 100, reps: 5 })],
      }),
    ],
  });
});

test('getRoutinesWithSummaries preserves input order and duplicate exercises', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const squat = await seededExercise('Barbell Squat');
  const routine = await saveRoutineDraft({
    name: 'Strength',
    notes: null,
    exercises: [
      { exercise_id: squat.id, exercise_type: 'weight_reps', notes: null, sets: [] },
      { exercise_id: bench.id, exercise_type: 'weight_reps', notes: null, sets: [] },
      { exercise_id: bench.id, exercise_type: 'weight_reps', notes: null, sets: [] },
    ],
  });
  const db = await getDb();
  const getAllAsync = jest.spyOn(db, 'getAllAsync');

  await expect(getRoutinesWithSummaries(db)).resolves.toEqual([
    expect.objectContaining({
      id: routine.id,
      exerciseCount: 3,
      exerciseNames: [
        'Barbell Squat',
        'Barbell Bench Press - Medium Grip',
        'Barbell Bench Press - Medium Grip',
      ],
    }),
  ]);
  expect(getAllAsync).toHaveBeenCalledTimes(2);
  getAllAsync.mockRestore();
  await expect(getRoutinesWithSummariesFromStore()).resolves.toHaveLength(1);
});

test('saveRoutineDraft rejects invalid input and rolls back a failed child insert', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const before = await getRoutinesWithSummariesFromStore();

  await expect(
    saveRoutineDraft({
      name: 'Valid',
      notes: null,
      exercises: [
        { exercise_id: 'missing-exercise', exercise_type: 'weight_reps', notes: null, sets: [] },
      ],
    })
  ).rejects.toThrow('Exercise not found');
  await expect(getRoutinesWithSummariesFromStore()).resolves.toEqual(before);

  await expect(
    saveRoutineDraft({
      name: '   ',
      notes: null,
      exercises: [{ exercise_id: bench.id, exercise_type: 'weight_reps', notes: null, sets: [] }],
    })
  ).rejects.toThrow('Routine name is required.');
});
