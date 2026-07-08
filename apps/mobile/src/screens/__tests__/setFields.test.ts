import { formatCompactSet, formatSet, resolveRestSeconds } from '../setFields';

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
