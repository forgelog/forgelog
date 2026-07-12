export type SetFieldKey = 'weight' | 'reps' | 'duration' | 'distance';

export const EXERCISE_TYPES = [
  'weight_reps',
  'reps_only',
  'weighted_bodyweight',
  'assisted_bodyweight',
  'duration',
  'duration_weight',
  'distance_duration',
  'weight_distance',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps',
  weighted_bodyweight: 'Added × reps',
  assisted_bodyweight: 'Assist × reps',
  duration: 'Time',
  duration_weight: 'Weight × time',
  distance_duration: 'Distance × time',
  weight_distance: 'Weight × distance',
};

export type ExerciseTypeFieldDescriptor = {
  key: SetFieldKey;
  columnLabel: string;
  inputLabel: string;
  placeholder: string;
  keyboardType: 'number-pad' | 'decimal-pad';
  parser: 'integer' | 'number';
};

const WEIGHT_FIELD: ExerciseTypeFieldDescriptor = {
  key: 'weight',
  columnLabel: 'Weight',
  inputLabel: 'weight',
  placeholder: 'kg',
  keyboardType: 'decimal-pad',
  parser: 'number',
};

const ADDED_WEIGHT_FIELD: ExerciseTypeFieldDescriptor = {
  ...WEIGHT_FIELD,
  columnLabel: 'Added',
  inputLabel: 'added weight',
};

const ASSISTANCE_WEIGHT_FIELD: ExerciseTypeFieldDescriptor = {
  ...WEIGHT_FIELD,
  columnLabel: 'Assist',
  inputLabel: 'assistance',
};

const REPS_FIELD: ExerciseTypeFieldDescriptor = {
  key: 'reps',
  columnLabel: 'Reps',
  inputLabel: 'reps',
  placeholder: 'reps',
  keyboardType: 'number-pad',
  parser: 'integer',
};

const DURATION_FIELD: ExerciseTypeFieldDescriptor = {
  key: 'duration',
  columnLabel: 'Time',
  inputLabel: 'duration',
  placeholder: 'sec',
  keyboardType: 'number-pad',
  parser: 'integer',
};

const DISTANCE_FIELD: ExerciseTypeFieldDescriptor = {
  key: 'distance',
  columnLabel: 'Distance',
  inputLabel: 'distance',
  placeholder: 'm',
  keyboardType: 'decimal-pad',
  parser: 'number',
};

const FIELDS: Record<ExerciseType, readonly ExerciseTypeFieldDescriptor[]> = {
  weight_reps: [WEIGHT_FIELD, REPS_FIELD],
  reps_only: [REPS_FIELD],
  weighted_bodyweight: [ADDED_WEIGHT_FIELD, REPS_FIELD],
  assisted_bodyweight: [ASSISTANCE_WEIGHT_FIELD, REPS_FIELD],
  duration: [DURATION_FIELD],
  duration_weight: [WEIGHT_FIELD, DURATION_FIELD],
  distance_duration: [DISTANCE_FIELD, DURATION_FIELD],
  weight_distance: [WEIGHT_FIELD, DISTANCE_FIELD],
};

export const FIELD_PLACEHOLDER: Record<SetFieldKey, string> = {
  weight: WEIGHT_FIELD.placeholder,
  reps: REPS_FIELD.placeholder,
  duration: DURATION_FIELD.placeholder,
  distance: DISTANCE_FIELD.placeholder,
};

export function normalizeExerciseType(value: string | null): ExerciseType | null {
  return EXERCISE_TYPES.includes(value as ExerciseType) ? (value as ExerciseType) : null;
}

export function requireExerciseType(value: string | null): ExerciseType {
  const type = normalizeExerciseType(value);
  if (!type) throw new Error(`Missing or invalid exercise_type: ${value ?? 'null'}`);
  return type;
}

export function fieldsForExerciseType(type: ExerciseType): readonly ExerciseTypeFieldDescriptor[] {
  return FIELDS[type];
}

export function parseSetFieldValue(
  field: ExerciseTypeFieldDescriptor,
  raw: string
): number | null | undefined {
  return field.parser === 'integer' ? parseNonNegativeInteger(raw) : parseNonNegativeNumber(raw);
}

type SetLike = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
};

// Full display format with units, e.g. "80 kg × 8 reps" — used for read-only
// history views (workout detail, exercise history).
export function formatSet(exerciseType: string | null, set: SetLike): string {
  const type = requireExerciseType(exerciseType);
  return FIELDS[type].map((field) => formatField(type, field.key, set)).join(' × ');
}

// Compact, unit-less format, e.g. "77.5 × 8" — used for the narrow PREV
// column while actively logging a set.
export function formatCompactSet(exerciseType: string | null, set: SetLike): string | null {
  const type = requireExerciseType(exerciseType);
  const values = FIELDS[type].map((field) => valueForField(field.key, set));
  if (values.some((value) => value == null)) return null;
  return values.join(' × ');
}

function valueForField(field: SetFieldKey, set: SetLike): number | null {
  switch (field) {
    case 'weight':
      return set.weight;
    case 'reps':
      return set.reps;
    case 'duration':
      return set.duration_seconds;
    case 'distance':
      return set.distance_meters;
  }
}

function formatField(type: ExerciseType, field: SetFieldKey, set: SetLike): string {
  const value = valueForField(field, set) ?? '-';
  switch (field) {
    case 'weight':
      if (type === 'weighted_bodyweight') return `${value} kg added`;
      if (type === 'assisted_bodyweight') return `${value} kg assist`;
      return `${value} kg`;
    case 'reps':
      return `${value} reps`;
    case 'duration':
      return `${value} s`;
    case 'distance':
      return `${value} m`;
  }
}

// Parses a numeric text input, rejecting negative and non-finite values
// (e.g. "-5", "Infinity", "abc"). Returns null when the field was
// intentionally cleared, or undefined when the input should be rejected.
export function parseNonNegativeNumber(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

// Same as parseNonNegativeNumber but also rejects decimals — for
// integer-only fields like reps, duration, and rest seconds.
export function parseNonNegativeInteger(raw: string): number | null | undefined {
  const value = parseNonNegativeNumber(raw);
  if (value == null) return value;
  return Number.isInteger(value) ? value : undefined;
}

const LOGGED_VALUE_FIELD: Record<ExerciseType, keyof SetLike> = {
  weight_reps: 'reps',
  reps_only: 'reps',
  weighted_bodyweight: 'reps',
  assisted_bodyweight: 'reps',
  duration: 'duration_seconds',
  duration_weight: 'duration_seconds',
  distance_duration: 'duration_seconds',
  weight_distance: 'distance_meters',
};

export function hasLoggedValue(exerciseType: string | null, set: SetLike): boolean {
  const type = requireExerciseType(exerciseType);
  return (set[LOGGED_VALUE_FIELD[type]] ?? 0) > 0;
}

export const DEFAULT_REST_SECONDS = 90;

// Per-exercise rest_seconds (snapshotted onto workout_exercises at workout
// start) wins; null falls back to the default rest duration.
export function resolveRestSeconds(
  restSeconds: number | null,
  defaultSeconds: number = DEFAULT_REST_SECONDS
): number {
  return restSeconds ?? defaultSeconds;
}
