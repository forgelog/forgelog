import type { SetType } from './routineDraft';

type RoutineSetSource = {
  id: string;
  position: number;
  set_type: SetType;
  target_weight: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
};

type RoutineExerciseSource = {
  id: string;
  exercise_id: string;
  position: number;
  superset_group_id: string | null;
  exercise_type: string;
  notes: string | null;
  sets: RoutineSetSource[];
};

type RoutineSource = {
  id: string;
  name: string;
  notes: string | null;
  exercises: RoutineExerciseSource[];
};

type WorkoutSetSource = {
  position: number;
  source_routine_set_id?: string | null;
  set_type: SetType;
};

type WorkoutExerciseSource = {
  exercise_id: string;
  position: number;
  source_routine_exercise_id?: string | null;
  superset_group_id: string | null;
  exercise_type: string;
  sets: WorkoutSetSource[];
};

type WorkoutSource = {
  exercises: WorkoutExerciseSource[];
};

export type RoutineStructureChangeKind =
  | 'exercises-added-or-removed'
  | 'exercise-order'
  | 'sets-added-or-removed'
  | 'set-type-or-order'
  | 'superset-grouping';

export type RoutineStructureChange = {
  kind: RoutineStructureChangeKind;
  label: string;
};

export type RoutineStructureDraft = {
  routineId?: string;
  name: string;
  notes: string | null;
  exercises: {
    exercise_id: string;
    superset_group_id: string | null;
    exercise_type: string;
    notes: string | null;
    sets: {
      set_type: SetType;
      target_weight: number | null;
      target_reps: number | null;
      target_duration_seconds: number | null;
      target_distance_meters: number | null;
    }[];
  }[];
};

const CHANGE_LABELS: Record<RoutineStructureChangeKind, string> = {
  'exercises-added-or-removed': 'Exercises were added or removed',
  'exercise-order': 'Exercise order changed',
  'sets-added-or-removed': 'Sets were added or removed',
  'set-type-or-order': 'Set types or order changed',
  'superset-grouping': 'Superset grouping changed',
};

const CHANGE_ORDER = Object.keys(CHANGE_LABELS) as RoutineStructureChangeKind[];

export function findRoutineStructureChanges(
  routine: RoutineSource,
  workout: WorkoutSource
): RoutineStructureChange[] {
  const kinds = new Set<RoutineStructureChangeKind>();
  const routineExerciseKeys = occurrenceKeys(routine.exercises, (exercise) => exercise.exercise_id);
  const workoutExerciseKeys = occurrenceKeys(workout.exercises, (exercise) => exercise.exercise_id);
  const hasExerciseOrigins = workout.exercises.every((exercise) =>
    Object.hasOwn(exercise, 'source_routine_exercise_id')
  );
  const routineExercisesById = new Map(
    routine.exercises.map((exercise) => [exercise.id, exercise] as const)
  );
  const sourcedExerciseIds = workout.exercises.flatMap((exercise) =>
    exercise.source_routine_exercise_id &&
    routineExercisesById.has(exercise.source_routine_exercise_id)
      ? [exercise.source_routine_exercise_id]
      : []
  );
  const hasExplicitlyNewExercise =
    hasExerciseOrigins &&
    workout.exercises.some((exercise) => exercise.source_routine_exercise_id === null);
  const hasReliableExerciseOrigins =
    hasExerciseOrigins &&
    workout.exercises.every(
      (exercise) =>
        Boolean(exercise.source_routine_exercise_id) &&
        routineExercisesById.has(exercise.source_routine_exercise_id ?? '')
    );
  const exerciseMembershipChanged = hasExerciseMembershipChange({
    hasExplicitlyNewExercise,
    hasReliableExerciseOrigins,
    routineExerciseIds: routine.exercises.map((exercise) => exercise.id),
    sourcedExerciseIds,
    routineExerciseKeys,
    workoutExerciseKeys,
  });
  const exerciseOrderChanged = hasReliableExerciseOrigins
    ? !sameArray(
        routine.exercises.map((exercise) => exercise.id),
        sourcedExerciseIds
      )
    : !sameArray(routineExerciseKeys, workoutExerciseKeys);

  if (exerciseMembershipChanged) {
    kinds.add('exercises-added-or-removed');
  } else if (exerciseOrderChanged) {
    kinds.add('exercise-order');
  }

  const routineByOccurrence = new Map(
    routineExerciseKeys.map((key, index) => [key, routine.exercises[index]] as const)
  );
  workoutExerciseKeys.forEach((key, workoutIndex) => {
    const workoutExercise = workout.exercises[workoutIndex];
    const routineExercise = comparableRoutineExercise({
      workoutExercise,
      hasReliableExerciseOrigins,
      routineExercisesById,
      routineByOccurrence,
      occurrenceKey: key,
    });
    if (!routineExercise) return;
    if (hasSetMembershipChange(routineExercise.sets, workoutExercise.sets)) {
      kinds.add('sets-added-or-removed');
    }
    if (hasSetTypeOrOrderChange(routineExercise.sets, workoutExercise.sets)) {
      kinds.add('set-type-or-order');
    }
  });

  if (!sameNestedArray(supersetGroups(routine.exercises), supersetGroups(workout.exercises))) {
    kinds.add('superset-grouping');
  }

  return CHANGE_ORDER.flatMap((kind) =>
    kinds.has(kind) ? [{ kind, label: CHANGE_LABELS[kind] }] : []
  );
}

type ExerciseMembershipComparison = {
  hasExplicitlyNewExercise: boolean;
  hasReliableExerciseOrigins: boolean;
  routineExerciseIds: string[];
  sourcedExerciseIds: string[];
  routineExerciseKeys: string[];
  workoutExerciseKeys: string[];
};

function hasExerciseMembershipChange({
  hasExplicitlyNewExercise,
  hasReliableExerciseOrigins,
  routineExerciseIds,
  sourcedExerciseIds,
  routineExerciseKeys,
  workoutExerciseKeys,
}: ExerciseMembershipComparison): boolean {
  if (hasExplicitlyNewExercise) return true;
  if (hasReliableExerciseOrigins) {
    return routineExerciseIds.some((exerciseId) => !sourcedExerciseIds.includes(exerciseId));
  }
  return !sameMultiset(routineExerciseKeys, workoutExerciseKeys);
}

type ComparableRoutineExerciseInput = {
  workoutExercise: WorkoutExerciseSource;
  hasReliableExerciseOrigins: boolean;
  routineExercisesById: Map<string, RoutineExerciseSource>;
  routineByOccurrence: Map<string, RoutineExerciseSource>;
  occurrenceKey: string;
};

function comparableRoutineExercise({
  workoutExercise,
  hasReliableExerciseOrigins,
  routineExercisesById,
  routineByOccurrence,
  occurrenceKey,
}: ComparableRoutineExerciseInput): RoutineExerciseSource | undefined {
  if (workoutExercise.source_routine_exercise_id === null) return undefined;
  if (hasReliableExerciseOrigins) {
    return routineExercisesById.get(workoutExercise.source_routine_exercise_id ?? '');
  }
  return routineByOccurrence.get(occurrenceKey);
}

function hasSetMembershipChange(
  routineSets: RoutineSetSource[],
  workoutSets: WorkoutSetSource[]
): boolean {
  const hasSetOrigins = workoutSets.every((set) => Object.hasOwn(set, 'source_routine_set_id'));
  if (!hasSetOrigins) return routineSets.length !== workoutSets.length;

  const routineSetIds = new Set(routineSets.map((set) => set.id));
  if (workoutSets.some((set) => set.source_routine_set_id === null)) return true;
  const hasReliableSetOrigins = workoutSets.every(
    (set) =>
      Boolean(set.source_routine_set_id) && routineSetIds.has(set.source_routine_set_id ?? '')
  );
  if (!hasReliableSetOrigins) return routineSets.length !== workoutSets.length;
  const sourcedSetIds = workoutSets.flatMap((set) =>
    set.source_routine_set_id && routineSetIds.has(set.source_routine_set_id)
      ? [set.source_routine_set_id]
      : []
  );
  return (
    sourcedSetIds.length !== workoutSets.length ||
    routineSets.some((set) => !sourcedSetIds.includes(set.id))
  );
}

export function buildRoutineDraftFromWorkout(
  workout: WorkoutSource,
  options: { existingRoutine: RoutineSource } | { name: string }
): RoutineStructureDraft {
  const existingRoutine = 'existingRoutine' in options ? options.existingRoutine : null;
  const usedRoutineExerciseIds = new Set<string>();

  return {
    routineId: existingRoutine?.id,
    name: existingRoutine?.name ?? ('name' in options ? options.name : ''),
    notes: existingRoutine?.notes ?? null,
    exercises: workout.exercises.map((workoutExercise) => {
      const routineExercise = existingRoutine
        ? matchRoutineExercise(existingRoutine.exercises, workoutExercise, usedRoutineExerciseIds)
        : null;
      if (routineExercise) usedRoutineExerciseIds.add(routineExercise.id);
      const usedRoutineSetIds = new Set<string>();

      return {
        exercise_id: workoutExercise.exercise_id,
        superset_group_id: workoutExercise.superset_group_id,
        exercise_type: workoutExercise.exercise_type,
        notes: routineExercise?.notes ?? null,
        sets: workoutExercise.sets.map((workoutSet) => {
          const routineSet = routineExercise
            ? matchRoutineSet(routineExercise.sets, workoutSet, usedRoutineSetIds)
            : null;
          if (routineSet) usedRoutineSetIds.add(routineSet.id);
          return {
            set_type: workoutSet.set_type,
            target_weight: routineSet?.target_weight ?? null,
            target_reps: routineSet?.target_reps ?? null,
            target_duration_seconds: routineSet?.target_duration_seconds ?? null,
            target_distance_meters: routineSet?.target_distance_meters ?? null,
          };
        }),
      };
    }),
  };
}

function hasSetTypeOrOrderChange(
  routineSets: RoutineSetSource[],
  workoutSets: WorkoutSetSource[]
): boolean {
  const routineById = new Map(routineSets.map((set) => [set.id, set] as const));
  const sourcedWorkoutSets = workoutSets.filter(
    (set): set is WorkoutSetSource & { source_routine_set_id: string } =>
      Boolean(set.source_routine_set_id && routineById.has(set.source_routine_set_id))
  );

  if (sourcedWorkoutSets.length > 0) {
    if (
      sourcedWorkoutSets.some(
        (set) => routineById.get(set.source_routine_set_id)?.set_type !== set.set_type
      )
    ) {
      return true;
    }
    const retainedRoutineOrder = routineSets
      .filter((set) =>
        sourcedWorkoutSets.some((workoutSet) => workoutSet.source_routine_set_id === set.id)
      )
      .map((set) => set.id);
    return !sameArray(
      retainedRoutineOrder,
      sourcedWorkoutSets.map((set) => set.source_routine_set_id)
    );
  }

  if (routineSets.length !== workoutSets.length) return false;
  return !sameArray(
    routineSets.map((set) => set.set_type),
    workoutSets.map((set) => set.set_type)
  );
}

function matchRoutineExercise(
  routineExercises: RoutineExerciseSource[],
  workoutExercise: WorkoutExerciseSource,
  usedIds: Set<string>
): RoutineExerciseSource | null {
  if (workoutExercise.source_routine_exercise_id === null) return null;
  const candidates = routineExercises.filter((exercise) => !usedIds.has(exercise.id));
  return (
    candidates.find((exercise) => exercise.id === workoutExercise.source_routine_exercise_id) ??
    candidates.find(
      (exercise) =>
        exercise.exercise_id === workoutExercise.exercise_id &&
        exercise.position === workoutExercise.position
    ) ??
    candidates.find((exercise) => exercise.exercise_id === workoutExercise.exercise_id) ??
    null
  );
}

function matchRoutineSet(
  routineSets: RoutineSetSource[],
  workoutSet: WorkoutSetSource,
  usedIds: Set<string>
): RoutineSetSource | null {
  if (workoutSet.source_routine_set_id === null) return null;
  const candidates = routineSets.filter((set) => !usedIds.has(set.id));
  return (
    candidates.find((set) => set.id === workoutSet.source_routine_set_id) ??
    candidates.find((set) => set.position === workoutSet.position) ??
    null
  );
}

function occurrenceKeys<T>(values: T[], keyOf: (value: T) => string): string[] {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const base = keyOf(value);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return `${base}#${occurrence}`;
  });
}

function supersetGroups(exercises: { exercise_id: string; superset_group_id: string | null }[]) {
  const keys = occurrenceKeys(exercises, (exercise) => exercise.exercise_id);
  const groups = new Map<string, string[]>();
  exercises.forEach((exercise, index) => {
    if (!exercise.superset_group_id) return;
    const members = groups.get(exercise.superset_group_id) ?? [];
    members.push(keys[index]);
    groups.set(exercise.superset_group_id, members);
  });
  return [...groups.values()]
    .map((members) => [...members].sort(compareStrings))
    .sort(compareArrays);
}

function sameMultiset(left: string[], right: string[]): boolean {
  return sameArray([...left].sort(compareStrings), [...right].sort(compareStrings));
}

function sameArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNestedArray(left: string[][], right: string[][]): boolean {
  return (
    left.length === right.length &&
    left.every((values, index) => sameArray(values, right[index] ?? []))
  );
}

function compareArrays(left: string[], right: string[]): number {
  return left.join('\0').localeCompare(right.join('\0'));
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}
