import { computeRecords, estimatedOneRepMax } from '../records';

test('Epley 1RM formula', () => {
  expect(estimatedOneRepMax(100, 0)).toBe(100);
  expect(estimatedOneRepMax(100, 30)).toBe(200);
});

test('computes maxes across completed sets', () => {
  const records = computeRecords([
    { weight: 100, reps: 5 },
    { weight: 120, reps: 3 },
    { weight: 80, reps: 10 },
  ]);
  expect(records.max_weight).toBe(120);
  expect(records.max_reps).toBe(10);
  expect(records.max_volume).toBe(800); // 80 * 10
  expect(records.est_1rm).toBeCloseTo(estimatedOneRepMax(120, 3));
});

test('reps-only sets produce max_reps but no weight-based records', () => {
  const records = computeRecords([
    { weight: null, reps: 15 },
    { weight: null, reps: 20 },
  ]);
  expect(records.max_reps).toBe(20);
  expect(records.max_weight).toBeUndefined();
  expect(records.max_volume).toBeUndefined();
  expect(records.est_1rm).toBeUndefined();
});

test('empty set list produces no records', () => {
  expect(computeRecords([])).toEqual({});
});
