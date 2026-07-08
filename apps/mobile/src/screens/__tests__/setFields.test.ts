import { resolveRestSeconds } from '../setFields';

test('per-exercise rest_seconds wins when set', () => {
  expect(resolveRestSeconds(45)).toBe(45);
});

test('falls back to the default when rest_seconds is null', () => {
  expect(resolveRestSeconds(null)).toBe(90);
});

test('accepts a custom default', () => {
  expect(resolveRestSeconds(null, 60)).toBe(60);
});
