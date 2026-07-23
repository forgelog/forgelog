export const ACTIVE_WORKOUT_PROTOCOL_VERSION = 1 as const;
export const ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES = 90_000;

export type ActiveWorkoutLifecycle = 'none' | 'active' | 'finished' | 'discarded';
export type ActiveWorkoutTerminal = {
  ended_at: string;
  operation_id: string | null;
  origin_device_id: string | null;
};

export type ActiveWorkoutSet = {
  id: string;
  source_routine_set_id: string | null;
  position: number;
  set_type: string;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  completed: boolean;
  completed_at: string | null;
};

export type ActiveWorkoutExercise = {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  exercise_type: string;
  notes: string | null;
  source_routine_exercise_id: string | null;
  superset_group_id: string | null;
  pr_baselines: Record<string, number>;
  alerted_record_types: string[];
  sets: ActiveWorkoutSet[];
};

export type ActiveWorkoutSnapshot = {
  id: string;
  routine_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  bodyweight_kg: number | null;
  routine_structure_version: number | null;
  exercises: ActiveWorkoutExercise[];
};

export type ActiveWorkoutCanonicalState = {
  protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
  coordinator_id: string;
  coordinator_epoch: string;
  revision: number;
  revision_committed_at: string;
  lifecycle: ActiveWorkoutLifecycle;
  workout_id: string | null;
  workout: ActiveWorkoutSnapshot | null;
  terminal: ActiveWorkoutTerminal | null;
};

export type ActiveWorkoutOperation =
  | { type: 'start_workout'; workout: ActiveWorkoutSnapshot }
  | {
      type: 'recover_workout';
      recovery_lifecycle: Exclude<ActiveWorkoutLifecycle, 'none'>;
      workout: ActiveWorkoutSnapshot | null;
      old_epoch: string;
      old_operation_ids: readonly string[];
    }
  | { type: 'rename_workout'; name: string }
  | { type: 'update_workout_notes'; notes: string | null }
  | { type: 'add_exercise'; exercise: ActiveWorkoutExercise }
  | { type: 'remove_exercise'; exercise_id: string }
  | { type: 'reorder_exercises'; exercise_ids: readonly string[] }
  | {
      type: 'update_exercise';
      exercise_id: string;
      field: 'notes' | 'exercise_type' | 'superset_group_id';
      value: string | null;
    }
  | { type: 'add_set'; exercise_id: string; set: ActiveWorkoutSet }
  | { type: 'remove_set'; exercise_id: string; set_id: string }
  | { type: 'reorder_sets'; exercise_id: string; set_ids: readonly string[] }
  | {
      type: 'update_set';
      set_id: string;
      field:
        | 'weight'
        | 'reps'
        | 'duration_seconds'
        | 'distance_meters'
        | 'rpe'
        | 'set_type';
      value: number | string | null;
    }
  | {
      type: 'complete_set';
      set_id: string;
      exercise_id: string;
      completed: boolean;
      completed_at: string | null;
      alerted_record_types: readonly string[];
    }
  | { type: 'finish_workout'; ended_at: string }
  | { type: 'discard_workout'; discarded_at: string };

export type ActiveWorkoutMutation = {
  protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
  operation_id: string;
  device_id: string;
  device_sequence: number;
  coordinator_epoch: string;
  workout_id: string;
  base_revision: number;
  predecessor_operation_id: string | null;
  conflict_keys: string[];
  created_at: string;
  operation: ActiveWorkoutOperation;
};

export type ActiveWorkoutResult =
  | {
      protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
      coordinator_epoch: string;
      device_id: string;
      device_sequence: number;
      operation_id: string | null;
      status: 'accepted';
      canonical_revision: number;
      idempotent: boolean;
      normalized_values?: Record<string, unknown>;
      terminal_workout?: ActiveWorkoutSnapshot;
    }
  | {
      protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
      coordinator_epoch: string;
      device_id: string;
      device_sequence: number;
      operation_id: string | null;
      status: 'rejected';
      canonical_revision: number;
      reason: string;
      conflict_keys: string[];
      canonical_values?: Record<string, unknown>;
    }
  | {
      protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
      coordinator_epoch: string;
      device_id: string;
      device_sequence: number;
      operation_id: string | null;
      status: 'needs_resolution' | 'blocked_by_predecessor';
      canonical_revision: number;
      reason: string;
    }
  | {
      protocol_version: typeof ACTIVE_WORKOUT_PROTOCOL_VERSION;
      coordinator_epoch: string;
      device_id: string;
      device_sequence: number;
      operation_id: string | null;
      status: 'resolved';
      canonical_revision: number;
      resolution: 'canonical_kept' | 'operation_reapplied';
      resolution_revision: number;
    };

export type ActiveWorkoutApplyResult =
  | { kind: 'applied'; state: ActiveWorkoutCanonicalState }
  | { kind: 'noop'; state: ActiveWorkoutCanonicalState }
  | { kind: 'conflict'; reason: string; conflict_keys: string[] };

const EXERCISE_UPDATE_FIELDS = new Set(['notes', 'exercise_type', 'superset_group_id']);
const SET_UPDATE_FIELDS = new Set([
  'weight', 'reps', 'duration_seconds', 'distance_meters', 'rpe', 'set_type',
]);

export function parseActiveWorkoutMutation(value: unknown): ActiveWorkoutMutation | null {
  if (!isActiveWorkoutMutation(value)) return null;
  const mutation = value as ActiveWorkoutMutation;
  return { ...mutation, operation: normalizeOperation(mutation.operation) };
}

export function isActiveWorkoutMutation(value: unknown): boolean {
  if (!isRecord(value) ||
      value.protocol_version !== ACTIVE_WORKOUT_PROTOCOL_VERSION ||
      !isNonEmptyString(value.operation_id) ||
      !isNonEmptyString(value.device_id) ||
      !isPositiveInteger(value.device_sequence) ||
      !isNonEmptyString(value.coordinator_epoch) ||
      !isNonEmptyString(value.workout_id) ||
      !isNonNegativeInteger(value.base_revision) ||
      !(value.predecessor_operation_id === null || isString(value.predecessor_operation_id)) ||
      !isStringArray(value.conflict_keys) ||
      !isString(value.created_at) ||
      !isRecord(value.operation)) return false;
  return isActiveWorkoutOperation(value.operation);
}

function isActiveWorkoutOperation(operation: Record<string, unknown>): boolean {
  switch (operation.type) {
    case 'start_workout':
      return isActiveWorkoutSnapshot(operation.workout);
    case 'recover_workout':
      return ['active', 'finished', 'discarded'].includes(String(operation.recovery_lifecycle)) &&
        (operation.workout === null || isActiveWorkoutSnapshot(operation.workout)) &&
        isString(operation.old_epoch) && isStringArray(operation.old_operation_ids);
    case 'rename_workout':
      return isString(operation.name);
    case 'update_workout_notes':
      return isNullableString(operation.notes);
    case 'add_exercise':
      return isActiveWorkoutExercise(operation.exercise);
    case 'remove_exercise':
      return isString(operation.exercise_id);
    case 'reorder_exercises':
      return isStringArray(operation.exercise_ids);
    case 'update_exercise':
      return isString(operation.exercise_id) && isString(operation.field) &&
        EXERCISE_UPDATE_FIELDS.has(operation.field) && isNullableString(operation.value) &&
        (operation.field !== 'exercise_type' || isString(operation.value));
    case 'add_set':
      return isString(operation.exercise_id) && isActiveWorkoutSet(operation.set);
    case 'remove_set':
      return isString(operation.exercise_id) && isString(operation.set_id);
    case 'reorder_sets':
      return isString(operation.exercise_id) && isStringArray(operation.set_ids);
    case 'update_set':
      return isString(operation.set_id) && isString(operation.field) &&
        SET_UPDATE_FIELDS.has(operation.field) &&
        (operation.field === 'set_type'
          ? isString(operation.value)
          : operation.value === null || isFiniteNumber(operation.value));
    case 'complete_set':
      return isString(operation.set_id) && isString(operation.exercise_id) &&
        typeof operation.completed === 'boolean' && isNullableString(operation.completed_at) &&
        isStringArray(operation.alerted_record_types);
    case 'finish_workout':
      return isString(operation.ended_at);
    case 'discard_workout':
      return isString(operation.discarded_at);
    default:
      return false;
  }
}

function isActiveWorkoutSnapshot(value: unknown): value is ActiveWorkoutSnapshot {
  return isRecord(value) && isNonEmptyString(value.id) && isOptionalNullableString(value.routine_id) &&
    isString(value.name) && isString(value.started_at) && isOptionalNullableString(value.ended_at) &&
    isOptionalNullableString(value.notes) && isOptionalNullableNumber(value.bodyweight_kg) &&
    (value.routine_structure_version === undefined || value.routine_structure_version === null || Number.isInteger(value.routine_structure_version)) &&
    Array.isArray(value.exercises) && value.exercises.every(isActiveWorkoutExercise);
}

function isActiveWorkoutExercise(value: unknown): value is ActiveWorkoutExercise {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.exercise_id) &&
    isString(value.exercise_name) && isNonNegativeInteger(value.position) &&
    isString(value.exercise_type) && isOptionalNullableString(value.notes) &&
    isOptionalNullableString(value.source_routine_exercise_id) && isOptionalNullableString(value.superset_group_id) &&
    isRecord(value.pr_baselines) && Object.values(value.pr_baselines).every(isFiniteNumber) &&
    isStringArray(value.alerted_record_types) && Array.isArray(value.sets) &&
    value.sets.every(isActiveWorkoutSet);
}

function isActiveWorkoutSet(value: unknown): value is ActiveWorkoutSet {
  return isRecord(value) && isNonEmptyString(value.id) && isOptionalNullableString(value.source_routine_set_id) &&
    isNonNegativeInteger(value.position) && isString(value.set_type) &&
    isOptionalNullableNumber(value.weight) && isOptionalNullableInteger(value.reps) &&
    isOptionalNullableInteger(value.duration_seconds) && isOptionalNullableNumber(value.distance_meters) &&
    isOptionalNullableNumber(value.rpe) && typeof value.completed === 'boolean' &&
    isOptionalNullableString(value.completed_at);
}

function normalizeOperation(operation: ActiveWorkoutOperation): ActiveWorkoutOperation {
  switch (operation.type) {
    case 'start_workout': return { ...operation, workout: normalizeSnapshot(operation.workout) };
    case 'recover_workout': return {
      ...operation,
      workout: operation.workout ? normalizeSnapshot(operation.workout) : null,
    };
    case 'add_exercise': return { ...operation, exercise: normalizeExercise(operation.exercise) };
    case 'add_set': return { ...operation, set: normalizeSet(operation.set) };
    default: return operation;
  }
}

function normalizeSnapshot(workout: ActiveWorkoutSnapshot): ActiveWorkoutSnapshot {
  return {
    ...workout,
    routine_id: workout.routine_id ?? null,
    ended_at: workout.ended_at ?? null,
    notes: workout.notes ?? null,
    bodyweight_kg: workout.bodyweight_kg ?? null,
    routine_structure_version: workout.routine_structure_version ?? null,
    exercises: workout.exercises.map(normalizeExercise),
  };
}

function normalizeExercise(exercise: ActiveWorkoutExercise): ActiveWorkoutExercise {
  return {
    ...exercise,
    notes: exercise.notes ?? null,
    source_routine_exercise_id: exercise.source_routine_exercise_id ?? null,
    superset_group_id: exercise.superset_group_id ?? null,
    sets: exercise.sets.map(normalizeSet),
  };
}

function normalizeSet(set: ActiveWorkoutSet): ActiveWorkoutSet {
  return {
    ...set,
    source_routine_set_id: set.source_routine_set_id ?? null,
    weight: set.weight ?? null,
    reps: set.reps ?? null,
    duration_seconds: set.duration_seconds ?? null,
    distance_meters: set.distance_meters ?? null,
    rpe: set.rpe ?? null,
    completed_at: set.completed_at ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNonEmptyString(value: unknown): value is string { return isString(value) && value.length > 0; }
function isNullableString(value: unknown): value is string | null { return value === null || isString(value); }
function isOptionalNullableString(value: unknown): boolean { return value === undefined || isNullableString(value); }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isNullableNumber(value: unknown): value is number | null { return value === null || isFiniteNumber(value); }
function isOptionalNullableNumber(value: unknown): boolean { return value === undefined || isNullableNumber(value); }
function isNonNegativeInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 0; }
function isPositiveInteger(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1; }
function isNullableInteger(value: unknown): value is number | null { return value === null || Number.isInteger(value); }
function isOptionalNullableInteger(value: unknown): boolean { return value === undefined || isNullableInteger(value); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(isString); }

export function deriveConflictKeys(
  operation: ActiveWorkoutOperation,
  workoutId: string
): string[] {
  const keys = (() => {
    switch (operation.type) {
      case 'start_workout':
        return ['active_workout', `workout:${workoutId}:entity`, `workout:${workoutId}:status`];
      case 'recover_workout':
        return ['active_workout', `workout:${workoutId}:entity`, `workout:${workoutId}:status`];
      case 'rename_workout':
        return [`workout:${workoutId}:name`];
      case 'update_workout_notes':
        return [`workout:${workoutId}:notes`];
      case 'add_exercise':
        return ['exercise_order', `exercise:${operation.exercise.id}:entity`];
      case 'remove_exercise':
        return [
          'exercise_order',
          `exercise:${operation.exercise_id}:entity`,
          `set_order:${operation.exercise_id}`,
        ];
      case 'reorder_exercises':
        return ['exercise_order'];
      case 'update_exercise':
        return [`exercise:${operation.exercise_id}:${operation.field}`];
      case 'add_set':
        return [`set_order:${operation.exercise_id}`, `set:${operation.set.id}:entity`];
      case 'remove_set':
        return [`set_order:${operation.exercise_id}`, `set:${operation.set_id}:entity`];
      case 'reorder_sets':
        return [`set_order:${operation.exercise_id}`];
      case 'update_set':
        return [`set:${operation.set_id}:${operation.field}`];
      case 'complete_set':
        return [
          `alerts:${operation.exercise_id}`,
          `set:${operation.set_id}:completed`,
          `set:${operation.set_id}:completed_at`,
        ];
      case 'finish_workout':
      case 'discard_workout':
        return [`workout:${workoutId}:status`];
    }
  })();
  return [...keys].sort();
}

export function applyActiveWorkoutMutation(
  canonical: ActiveWorkoutCanonicalState,
  mutation: ActiveWorkoutMutation
): ActiveWorkoutApplyResult {
  const operation = mutation.operation;
  const expectedKeys = deriveConflictKeys(operation, mutation.workout_id);
  if (!sameValue(expectedKeys, [...mutation.conflict_keys].sort())) {
    return { kind: 'conflict', reason: 'conflict_key_mismatch', conflict_keys: expectedKeys };
  }
  if (mutation.protocol_version !== ACTIVE_WORKOUT_PROTOCOL_VERSION) {
    return { kind: 'conflict', reason: 'unsupported_version', conflict_keys: expectedKeys };
  }
  if (canonical.coordinator_epoch !== mutation.coordinator_epoch) {
    return { kind: 'conflict', reason: 'coordinator_epoch_mismatch', conflict_keys: expectedKeys };
  }

  if (operation.type === 'start_workout' || operation.type === 'recover_workout') {
    const incoming = operation.workout;
    if (!incoming) {
      return { kind: 'conflict', reason: 'missing_workout', conflict_keys: expectedKeys };
    }
    if (canonical.lifecycle === 'none') {
      return {
        kind: 'applied',
        state: { ...canonical, lifecycle: 'active', workout_id: incoming.id, workout: incoming, terminal: null },
      };
    }
    if (canonical.workout_id === incoming.id && sameValue(canonical.workout, incoming)) {
      return { kind: 'noop', state: canonical };
    }
    return { kind: 'conflict', reason: 'independent_active_workout', conflict_keys: expectedKeys };
  }

  if (
    operation.type === 'discard_workout' &&
    canonical.lifecycle === 'discarded' &&
    canonical.workout_id === mutation.workout_id
  ) {
    return { kind: 'noop', state: canonical };
  }

  if (canonical.workout_id !== mutation.workout_id || !canonical.workout) {
    return { kind: 'conflict', reason: 'active_workout_mismatch', conflict_keys: expectedKeys };
  }

  const workout = canonical.workout;
  switch (operation.type) {
    case 'rename_workout':
      return updateWorkout(canonical, { ...workout, name: operation.name });
    case 'update_workout_notes':
      return updateWorkout(canonical, { ...workout, notes: operation.notes });
    case 'add_exercise': {
      const existing = workout.exercises.find((item) => item.id === operation.exercise.id);
      if (existing) {
        return sameValue(existing, operation.exercise)
          ? { kind: 'noop', state: canonical }
          : { kind: 'conflict', reason: 'entity_mismatch', conflict_keys: expectedKeys };
      }
      return updateWorkout(canonical, {
        ...workout,
        exercises: normalizePositions([...workout.exercises, operation.exercise]),
      });
    }
    case 'remove_exercise': {
      if (!workout.exercises.some((item) => item.id === operation.exercise_id)) {
        return { kind: 'noop', state: canonical };
      }
      return updateWorkout(canonical, {
        ...workout,
        exercises: normalizePositions(
          workout.exercises.filter((item) => item.id !== operation.exercise_id)
        ),
      });
    }
    case 'reorder_exercises': {
      const reordered = reorder(workout.exercises, operation.exercise_ids);
      if (!reordered) {
        return { kind: 'conflict', reason: 'membership_mismatch', conflict_keys: expectedKeys };
      }
      return updateWorkout(canonical, { ...workout, exercises: reordered });
    }
    case 'update_exercise': {
      const index = workout.exercises.findIndex((item) => item.id === operation.exercise_id);
      if (index < 0) {
        return { kind: 'conflict', reason: 'missing_entity', conflict_keys: expectedKeys };
      }
      const exercises = [...workout.exercises];
      exercises[index] = { ...exercises[index], [operation.field]: operation.value };
      return updateWorkout(canonical, { ...workout, exercises });
    }
    case 'add_set': {
      const target = workout.exercises.find((item) => item.id === operation.exercise_id);
      if (!target) {
        return { kind: 'conflict', reason: 'missing_parent', conflict_keys: expectedKeys };
      }
      const existing = target.sets.find((item) => item.id === operation.set.id);
      if (existing) {
        return sameValue(existing, operation.set)
          ? { kind: 'noop', state: canonical }
          : { kind: 'conflict', reason: 'entity_mismatch', conflict_keys: expectedKeys };
      }
      return replaceExercise(canonical, target.id, {
        ...target,
        sets: normalizePositions([...target.sets, operation.set]),
      });
    }
    case 'remove_set': {
      const target = workout.exercises.find((item) => item.id === operation.exercise_id);
      if (!target) {
        return { kind: 'conflict', reason: 'missing_parent', conflict_keys: expectedKeys };
      }
      if (!target.sets.some((item) => item.id === operation.set_id)) {
        return { kind: 'noop', state: canonical };
      }
      return replaceExercise(canonical, target.id, {
        ...target,
        sets: normalizePositions(target.sets.filter((item) => item.id !== operation.set_id)),
      });
    }
    case 'reorder_sets': {
      const target = workout.exercises.find((item) => item.id === operation.exercise_id);
      if (!target) {
        return { kind: 'conflict', reason: 'missing_parent', conflict_keys: expectedKeys };
      }
      const sets = reorder(target.sets, operation.set_ids);
      if (!sets) {
        return { kind: 'conflict', reason: 'membership_mismatch', conflict_keys: expectedKeys };
      }
      return replaceExercise(canonical, target.id, { ...target, sets });
    }
    case 'update_set': {
      const location = findSet(workout, operation.set_id);
      if (!location) {
        return { kind: 'conflict', reason: 'missing_entity', conflict_keys: expectedKeys };
      }
      return replaceExercise(canonical, location.exercise.id, {
        ...location.exercise,
        sets: location.exercise.sets.map((set) =>
          set.id === operation.set_id ? { ...set, [operation.field]: operation.value } : set
        ),
      });
    }
    case 'complete_set': {
      const target = workout.exercises.find((item) => item.id === operation.exercise_id);
      if (!target || !target.sets.some((item) => item.id === operation.set_id)) {
        return { kind: 'conflict', reason: 'missing_entity', conflict_keys: expectedKeys };
      }
      return replaceExercise(canonical, target.id, {
        ...target,
        alerted_record_types: [...new Set([
          ...target.alerted_record_types,
          ...operation.alerted_record_types,
        ])].sort(),
        sets: target.sets.map((set) =>
          set.id === operation.set_id
            ? { ...set, completed: operation.completed, completed_at: operation.completed_at }
            : set
        ),
      });
    }
    case 'finish_workout': {
      if (canonical.lifecycle === 'finished' && workout.ended_at === operation.ended_at) {
        return { kind: 'noop', state: canonical };
      }
      if (canonical.lifecycle !== 'active') {
        return { kind: 'conflict', reason: 'terminal_mismatch', conflict_keys: expectedKeys };
      }
      return {
        kind: 'applied',
        state: {
          ...canonical,
          lifecycle: 'finished',
          workout: { ...workout, ended_at: operation.ended_at },
          terminal: {
            ended_at: operation.ended_at,
            operation_id: mutation.operation_id,
            origin_device_id: mutation.device_id,
          },
        },
      };
    }
    case 'discard_workout': {
      if (canonical.lifecycle !== 'active') {
        return { kind: 'conflict', reason: 'terminal_mismatch', conflict_keys: expectedKeys };
      }
      return {
        kind: 'applied',
        state: {
          ...canonical,
          lifecycle: 'discarded',
          workout: null,
          terminal: {
            ended_at: operation.discarded_at,
            operation_id: mutation.operation_id,
            origin_device_id: mutation.device_id,
          },
        },
      };
    }
  }
}

export function assertActiveWorkoutPayloadSize(payload: unknown): void {
  if (utf8ByteLength(typeof payload === 'string' ? payload : JSON.stringify(payload)) > ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES) {
    throw new Error('active_workout_payload_too_large');
  }
}

export function normalizedActiveWorkoutJson(value: unknown): string {
  return stableJson(value);
}

function updateWorkout(
  canonical: ActiveWorkoutCanonicalState,
  workout: ActiveWorkoutSnapshot
): ActiveWorkoutApplyResult {
  if (sameValue(canonical.workout, workout)) return { kind: 'noop', state: canonical };
  return { kind: 'applied', state: { ...canonical, workout } };
}

function replaceExercise(
  canonical: ActiveWorkoutCanonicalState,
  exerciseId: string,
  exercise: ActiveWorkoutExercise
): ActiveWorkoutApplyResult {
  const workout = canonical.workout!;
  return updateWorkout(canonical, {
    ...workout,
    exercises: workout.exercises.map((item) => (item.id === exerciseId ? exercise : item)),
  });
}

function findSet(workout: ActiveWorkoutSnapshot, setId: string) {
  for (const exercise of workout.exercises) {
    const set = exercise.sets.find((item) => item.id === setId);
    if (set) return { exercise, set };
  }
  return null;
}

function reorder<T extends { id: string; position: number }>(items: T[], ids: readonly string[]): T[] | null {
  if (items.length !== ids.length || new Set(ids).size !== ids.length) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  if (ids.some((id) => !byId.has(id))) return null;
  return ids.map((id, position) => ({ ...byId.get(id)!, position }));
}

function normalizePositions<T extends { position: number }>(items: T[]): T[] {
  return [...items]
    .sort((left, right) => left.position - right.position)
    .map((item, position) => ({ ...item, position }));
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(',')}}`;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
