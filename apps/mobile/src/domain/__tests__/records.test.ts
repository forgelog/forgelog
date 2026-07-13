import { computeRecords, estimatedOneRepMax, isPrSet } from '../records';
import type { SetPerformance } from '../records';

const fixture = require('../../../../../data/contracts/fixtures/personal-records.json') as {
  weighted_sets: SetPerformance[];
  reps_only_sets: SetPerformance[];
};

test('estimated 1RM uses the supported rep-percentage table', () => {
  expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333);
  expect(estimatedOneRepMax(100, 16)).toBeNull();
});

test('computes maxes across completed sets', () => {
  const records = computeRecords(fixture.weighted_sets);
  expect(records.max_weight).toBe(120);
  expect(records.max_reps).toBeUndefined();
  expect(records.max_volume).toBe(800); // 80 * 10
  expect(records.est_1rm).toBeCloseTo(estimatedOneRepMax(120, 3)!);
});

test('reps-only sets produce max_reps but no weight-based records', () => {
  const records = computeRecords(fixture.reps_only_sets);
  expect(records.max_reps).toBe(20);
  expect(records.max_weight).toBeUndefined();
  expect(records.max_volume).toBeUndefined();
  expect(records.est_1rm).toBeUndefined();
});

test('empty set list produces no records', () => {
  expect(computeRecords([])).toEqual({});
});

const records = { max_weight: 100, max_reps: 12, max_volume: 800 };

test('isPrSet flags a set matching the max weight record', () => {
  expect(isPrSet({ weight: 100, reps: 5, completed: true }, records)).toBe(true);
});

test('isPrSet flags a set matching the max reps record', () => {
  expect(isPrSet({ weight: 40, reps: 12, completed: true }, records)).toBe(true);
});

test('isPrSet flags a set matching the max volume record', () => {
  expect(isPrSet({ weight: 80, reps: 10, completed: true }, records)).toBe(true);
});

test('isPrSet ignores incomplete sets', () => {
  expect(isPrSet({ weight: 100, reps: 5, completed: false }, records)).toBe(false);
});

test('isPrSet returns false when nothing matches', () => {
  expect(isPrSet({ weight: 50, reps: 6, completed: true }, records)).toBe(false);
});
