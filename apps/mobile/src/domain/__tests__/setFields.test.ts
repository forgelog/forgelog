import {
  effectiveTrackingType,
  fieldsFor,
  formatCompactSet,
  formatSet,
  hasLoggedValue,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
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

const set = { weight: 80, reps: 8, duration_seconds: null, distance_meters: null };
const emptySet = { weight: null, reps: null, duration_seconds: null, distance_meters: null };

test('effectiveTrackingType prefers a valid override over the catalog default', () => {
  expect(effectiveTrackingType('reps_only', 'weight_reps')).toBe('reps_only');
});

test('effectiveTrackingType falls back to a valid catalog default', () => {
  expect(effectiveTrackingType(null, 'duration')).toBe('duration');
});

test('effectiveTrackingType falls back to weight_reps for invalid values', () => {
  expect(effectiveTrackingType('legacy_tracking', 'duration')).toBe('weight_reps');
  expect(effectiveTrackingType(null, 'legacy_tracking')).toBe('weight_reps');
});

test('fieldsFor returns the fields for each tracking type and falls back for unknown values', () => {
  expect(fieldsFor('weight_reps')).toEqual(['weight', 'reps']);
  expect(fieldsFor('reps_only')).toEqual(['reps']);
  expect(fieldsFor('duration')).toEqual(['duration']);
  expect(fieldsFor('duration_distance')).toEqual(['duration', 'distance']);
  expect(fieldsFor('legacy_tracking')).toEqual(['weight', 'reps']);
});

test('formatSet renders weight × reps with units', () => {
  expect(formatSet('weight_reps', set)).toBe('80 kg × 8 reps');
});

test('formatSet falls back to an em dash for missing values', () => {
  expect(formatSet('weight_reps', emptySet)).toBe('– kg × – reps');
});

test('formatCompactSet renders weight × reps without units', () => {
  expect(formatCompactSet('weight_reps', set)).toBe('80 × 8');
});

test('formatCompactSet returns null when any field is missing', () => {
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

test('hasLoggedValue requires positive reps for weight_reps and reps_only sets', () => {
  expect(hasLoggedValue('weight_reps', { ...emptySet, reps: 8 })).toBe(true);
  expect(hasLoggedValue('weight_reps', { ...emptySet, reps: 0 })).toBe(false);
  expect(hasLoggedValue('weight_reps', emptySet)).toBe(false);
  expect(hasLoggedValue('reps_only', { ...emptySet, reps: 12 })).toBe(true);
});

test('hasLoggedValue requires positive duration for duration-based sets', () => {
  expect(hasLoggedValue('duration', { ...emptySet, duration_seconds: 30 })).toBe(true);
  expect(hasLoggedValue('duration', emptySet)).toBe(false);
  expect(hasLoggedValue('duration_distance', { ...emptySet, duration_seconds: 60 })).toBe(true);
});

test('hasLoggedValue does not require weight (bodyweight sets are valid)', () => {
  expect(hasLoggedValue('weight_reps', { ...emptySet, weight: null, reps: 10 })).toBe(true);
});
