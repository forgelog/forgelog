import type { RoutineDetail, WorkoutDetail } from '../../db/types';
import {
  buildRoutineDraftFromWorkout,
  findRoutineStructureChanges,
} from '../routineWorkoutStructure';

function routine(overrides: Partial<RoutineDetail> = {}): RoutineDetail {
  return {
    id: 'routine-1',
    name: 'Strength',
    notes: 'Keep this routine note',
    position: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    exercises: [
      {
        id: 'routine-exercise-bench',
        routine_id: 'routine-1',
        exercise_id: 'bench',
        position: 0,
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: 'Keep this exercise note',
        exercise: exercise('bench', 'Bench Press'),
        sets: [
          {
            id: 'routine-set-bench-1',
            routine_exercise_id: 'routine-exercise-bench',
            position: 0,
            set_type: 'normal',
            target_weight: 100,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function workout(overrides: Partial<WorkoutDetail> = {}): WorkoutDetail {
  return {
    id: 'workout-1',
    routine_id: 'routine-1',
    name: 'Strength',
    started_at: '2026-07-22T08:00:00.000Z',
    ended_at: null,
    notes: 'A workout-only note',
    bodyweight_kg: 80,
    exercises: [
      {
        id: 'workout-exercise-bench',
        workout_id: 'workout-1',
        exercise_id: 'bench',
        position: 0,
        source_routine_exercise_id: 'routine-exercise-bench',
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: 'Changed during this workout',
        exercise: exercise('bench', 'Bench Press'),
        sets: [
          {
            id: 'workout-set-bench-1',
            workout_exercise_id: 'workout-exercise-bench',
            position: 0,
            source_routine_set_id: 'routine-set-bench-1',
            set_type: 'normal',
            weight: 120,
            reps: 8,
            duration_seconds: null,
            distance_meters: null,
            rpe: 9,
            completed: true,
            completed_at: '2026-07-22T08:05:00.000Z',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function exercise(id: string, name: string) {
  return {
    id,
    name,
    muscle_group: 'chest',
    equipment: 'barbell',
    exercise_type: 'weight_reps',
    is_custom: false,
    instructions: [],
    images: [],
    secondary_muscles: [],
    created_at: '2026-07-01T00:00:00.000Z',
  };
}

test('logged values, completion, and notes do not count as routine changes', () => {
  expect(findRoutineStructureChanges(routine(), workout())).toEqual([]);
});

test('reports only structural routine changes', () => {
  const squatRoutine = routine({
    exercises: [
      routine().exercises[0],
      {
        ...routine().exercises[0],
        id: 'routine-exercise-squat',
        exercise_id: 'squat',
        position: 1,
        exercise: exercise('squat', 'Squat'),
        sets: [],
      },
    ],
  });
  const changedWorkout = workout({
    exercises: [
      {
        ...workout().exercises[0],
        id: 'workout-exercise-squat',
        exercise_id: 'squat',
        position: 0,
        source_routine_exercise_id: 'routine-exercise-squat',
        superset_group_id: 'pair-a',
        exercise: exercise('squat', 'Squat'),
        sets: [],
      },
      {
        ...workout().exercises[0],
        position: 1,
        superset_group_id: 'pair-a',
        sets: [
          {
            ...workout().exercises[0].sets[0],
            id: 'workout-set-bench-2',
            position: 0,
            source_routine_set_id: null,
          },
          { ...workout().exercises[0].sets[0], position: 1, set_type: 'warmup' },
        ],
      },
    ],
  });

  expect(
    findRoutineStructureChanges(squatRoutine, changedWorkout).map((change) => change.kind)
  ).toEqual(['exercise-order', 'sets-added-or-removed', 'set-type-or-order', 'superset-grouping']);
});

test('reports exercise additions and removals without treating their sets as separate changes', () => {
  const added = {
    ...workout().exercises[0],
    id: 'workout-exercise-row',
    exercise_id: 'row',
    position: 1,
    source_routine_exercise_id: null,
    exercise: exercise('row', 'Row'),
  };

  expect(
    findRoutineStructureChanges(routine(), workout({ exercises: [added] })).map(
      (change) => change.kind
    )
  ).toEqual(['exercises-added-or-removed']);
});

test('updating a routine preserves retained targets and notes while new sets stay targetless', () => {
  const currentWorkout = workout({
    exercises: [
      {
        ...workout().exercises[0],
        notes: 'Do not copy this note',
        sets: [
          { ...workout().exercises[0].sets[0], weight: 140, reps: 3 },
          {
            ...workout().exercises[0].sets[0],
            id: 'workout-set-bench-2',
            position: 1,
            source_routine_set_id: null,
            set_type: 'dropset',
            weight: 60,
            reps: 12,
          },
        ],
      },
    ],
  });

  expect(buildRoutineDraftFromWorkout(currentWorkout, { existingRoutine: routine() })).toEqual({
    routineId: 'routine-1',
    name: 'Strength',
    notes: 'Keep this routine note',
    exercises: [
      {
        exercise_id: 'bench',
        superset_group_id: null,
        exercise_type: 'weight_reps',
        notes: 'Keep this exercise note',
        sets: [
          {
            set_type: 'normal',
            target_weight: 100,
            target_reps: 5,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
          {
            set_type: 'dropset',
            target_weight: null,
            target_reps: null,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });
});

test('saving a freestyle workout creates a structure-only routine draft', () => {
  expect(buildRoutineDraftFromWorkout(workout(), { name: 'My Routine' })).toMatchObject({
    routineId: undefined,
    name: 'My Routine',
    notes: null,
    exercises: [
      {
        notes: null,
        sets: [
          {
            target_weight: null,
            target_reps: null,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
    ],
  });
});

test('re-added routine items with explicit null origins do not inherit removed targets or notes', () => {
  const replacedWorkout = workout({
    exercises: [
      {
        ...workout().exercises[0],
        source_routine_exercise_id: null,
        sets: [
          {
            ...workout().exercises[0].sets[0],
            source_routine_set_id: null,
          },
        ],
      },
    ],
  });

  expect(
    findRoutineStructureChanges(routine(), replacedWorkout).map((change) => change.kind)
  ).toEqual(['exercises-added-or-removed']);

  expect(
    buildRoutineDraftFromWorkout(replacedWorkout, { existingRoutine: routine() }).exercises[0]
  ).toMatchObject({
    notes: null,
    sets: [expect.objectContaining({ target_weight: null, target_reps: null })],
  });
});

test('stale non-null origins fall back to structural comparison after routine-only edits', () => {
  const staleWorkout = workout({
    exercises: [
      {
        ...workout().exercises[0],
        source_routine_exercise_id: 'deleted-routine-exercise-id',
        sets: [
          {
            ...workout().exercises[0].sets[0],
            source_routine_set_id: 'deleted-routine-set-id',
          },
        ],
      },
    ],
  });

  expect(findRoutineStructureChanges(routine(), staleWorkout)).toEqual([]);
  expect(
    buildRoutineDraftFromWorkout(staleWorkout, { existingRoutine: routine() }).exercises[0]
  ).toMatchObject({
    notes: 'Keep this exercise note',
    sets: [expect.objectContaining({ target_weight: 100, target_reps: 5 })],
  });
});

test('a same-position replacement set is structural and remains targetless', () => {
  const replacedSetWorkout = workout({
    exercises: [
      {
        ...workout().exercises[0],
        sets: [
          {
            ...workout().exercises[0].sets[0],
            source_routine_set_id: null,
          },
        ],
      },
    ],
  });

  expect(
    findRoutineStructureChanges(routine(), replacedSetWorkout).map((change) => change.kind)
  ).toEqual(['sets-added-or-removed']);
  expect(
    buildRoutineDraftFromWorkout(replacedSetWorkout, { existingRoutine: routine() }).exercises[0]
      .sets[0]
  ).toMatchObject({ target_weight: null, target_reps: null });
});
