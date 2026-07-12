import {
  EXERCISE_TYPES,
  fieldsForExerciseType,
  formatCompactSet,
  formatSet,
  hasLoggedValue,
  normalizeExerciseType,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  parseSetFieldValue,
  requireExerciseType,
  resolveRestSeconds,
} from '../setFields';

test('per-exercise rest_seconds wins when set', () => {
  expect(resolveRestSeconds(45)).toBe(45);
});

test('falls back to the default when rest_seconds is null', () => {
  expect(resolveRestSeconds(null)).toBe(90);
});

test('accepts a custom default', () => {
  expect(resolveRestSeconds(null, 60)).toBe(60);
});

const set = {
  weight: 80,
  reps: 8,
  duration_seconds: 45,
  distance_meters: 400,
};
const emptySet = {
  weight: null,
  reps: null,
  duration_seconds: null,
  distance_meters: null,
};

test('normalizes only canonical exercise type values', () => {
  expect(EXERCISE_TYPES).toEqual([
    'weight_reps',
    'reps_only',
    'weighted_bodyweight',
    'assisted_bodyweight',
    'duration',
    'duration_weight',
    'distance_duration',
    'weight_distance',
  ]);

  for (const type of EXERCISE_TYPES) {
    expect(normalizeExerciseType(type)).toBe(type);
  }

  expect(normalizeExerciseType('duration_distance')).toBeNull();
  expect(normalizeExerciseType('legacy_tracking')).toBeNull();
  expect(normalizeExerciseType(null)).toBeNull();
});

test('requireExerciseType rejects invalid or missing data', () => {
  expect(requireExerciseType('weighted_bodyweight')).toBe('weighted_bodyweight');
  expect(() => requireExerciseType(null)).toThrow('Missing or invalid exercise_type');
  expect(() => requireExerciseType('duration_distance')).toThrow('Missing or invalid exercise_type');
});

test('field descriptors define UI labels, placeholders, and parsers', () => {
  expect(fieldsForExerciseType('weight_reps')).toEqual([
    expect.objectContaining({ key: 'weight', columnLabel: 'Weight', inputLabel: 'weight', parser: 'number' }),
    expect.objectContaining({ key: 'reps', columnLabel: 'Reps', inputLabel: 'reps', parser: 'integer' }),
  ]);
  expect(fieldsForExerciseType('weighted_bodyweight')).toEqual([
    expect.objectContaining({ key: 'weight', columnLabel: 'Added', inputLabel: 'added weight' }),
    expect.objectContaining({ key: 'reps', columnLabel: 'Reps', inputLabel: 'reps' }),
  ]);
  expect(fieldsForExerciseType('assisted_bodyweight')).toEqual([
    expect.objectContaining({ key: 'weight', columnLabel: 'Assist', inputLabel: 'assistance' }),
    expect.objectContaining({ key: 'reps', columnLabel: 'Reps', inputLabel: 'reps' }),
  ]);
  expect(fieldsForExerciseType('duration_weight')).toEqual([
    expect.objectContaining({ key: 'weight', columnLabel: 'Weight' }),
    expect.objectContaining({ key: 'duration', columnLabel: 'Time', inputLabel: 'duration' }),
  ]);
  expect(fieldsForExerciseType('distance_duration')).toEqual([
    expect.objectContaining({ key: 'distance', columnLabel: 'Distance' }),
    expect.objectContaining({ key: 'duration', columnLabel: 'Time' }),
  ]);
  expect(fieldsForExerciseType('weight_distance')).toEqual([
    expect.objectContaining({ key: 'weight', columnLabel: 'Weight' }),
    expect.objectContaining({ key: 'distance', columnLabel: 'Distance' }),
  ]);
});

test('field descriptors are stable module-level references', () => {
  expect(fieldsForExerciseType('weight_reps')).toBe(fieldsForExerciseType('weight_reps'));
});

test('parseSetFieldValue uses the descriptor parser', () => {
  const [weight, reps] = fieldsForExerciseType('weight_reps');
  expect(parseSetFieldValue(weight, '77.5')).toBe(77.5);
  expect(parseSetFieldValue(reps, '7')).toBe(7);
  expect(parseSetFieldValue(reps, '7.5')).toBeUndefined();
});

test('formatSet renders semantic field labels with units', () => {
  expect(formatSet('weight_reps', set)).toBe('80 kg × 8 reps');
  expect(formatSet('weighted_bodyweight', set)).toBe('80 kg added × 8 reps');
  expect(formatSet('assisted_bodyweight', set)).toBe('80 kg assist × 8 reps');
  expect(formatSet('duration_weight', set)).toBe('80 kg × 45 s');
  expect(formatSet('distance_duration', set)).toBe('400 m × 45 s');
  expect(formatSet('weight_distance', set)).toBe('80 kg × 400 m');
});

test('formatSet falls back to an en dash for missing values', () => {
  expect(formatSet('weight_reps', emptySet)).toBe('- kg × - reps');
});

test('formatCompactSet renders selected fields without units', () => {
  expect(formatCompactSet('weight_reps', set)).toBe('80 × 8');
  expect(formatCompactSet('distance_duration', set)).toBe('400 × 45');
});

test('formatCompactSet returns null when any selected field is missing', () => {
  expect(formatCompactSet('weight_reps', emptySet)).toBeNull();
  expect(formatCompactSet('weight_reps', { ...set, reps: null })).toBeNull();
});

test('parseNonNegativeNumber clears the field on empty input', () => {
  expect(parseNonNegativeNumber('')).toBeNull();
  expect(parseNonNegativeNumber('   ')).toBeNull();
});

test('parseNonNegativeNumber accepts non-negative decimals', () => {
  expect(parseNonNegativeNumber('80')).toBe(80);
  expect(parseNonNegativeNumber('77.5')).toBe(77.5);
  expect(parseNonNegativeNumber('0')).toBe(0);
});

test('parseNonNegativeNumber rejects negative, non-finite, and malformed input', () => {
  expect(parseNonNegativeNumber('-5')).toBeUndefined();
  expect(parseNonNegativeNumber('Infinity')).toBeUndefined();
  expect(parseNonNegativeNumber('abc')).toBeUndefined();
});

test('parseNonNegativeInteger accepts non-negative whole numbers', () => {
  expect(parseNonNegativeInteger('8')).toBe(8);
  expect(parseNonNegativeInteger('0')).toBe(0);
  expect(parseNonNegativeInteger('')).toBeNull();
});

test('parseNonNegativeInteger rejects decimals and negatives', () => {
  expect(parseNonNegativeInteger('2.5')).toBeUndefined();
  expect(parseNonNegativeInteger('-3')).toBeUndefined();
});

test('hasLoggedValue requires positive reps for reps-based exercise types', () => {
  expect(hasLoggedValue('weight_reps', { ...emptySet, reps: 8 })).toBe(true);
  expect(hasLoggedValue('weighted_bodyweight', { ...emptySet, reps: 8 })).toBe(true);
  expect(hasLoggedValue('assisted_bodyweight', { ...emptySet, reps: 8 })).toBe(true);
  expect(hasLoggedValue('reps_only', { ...emptySet, reps: 12 })).toBe(true);
  expect(hasLoggedValue('weight_reps', { ...emptySet, reps: 0 })).toBe(false);
});

test('hasLoggedValue requires positive duration for duration-based exercise types', () => {
  expect(hasLoggedValue('duration', { ...emptySet, duration_seconds: 30 })).toBe(true);
  expect(hasLoggedValue('duration_weight', { ...emptySet, duration_seconds: 30 })).toBe(true);
  expect(hasLoggedValue('distance_duration', { ...emptySet, duration_seconds: 60 })).toBe(true);
  expect(hasLoggedValue('duration', emptySet)).toBe(false);
});

test('hasLoggedValue requires positive distance for weight_distance', () => {
  expect(hasLoggedValue('weight_distance', { ...emptySet, distance_meters: 25 })).toBe(true);
  expect(hasLoggedValue('weight_distance', { ...emptySet, distance_meters: 0 })).toBe(false);
});

test('hasLoggedValue does not require weight', () => {
  expect(hasLoggedValue('weight_reps', { ...emptySet, weight: null, reps: 10 })).toBe(true);
  expect(hasLoggedValue('weight_distance', { ...emptySet, weight: null, distance_meters: 10 })).toBe(true);
});
