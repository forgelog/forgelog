import { computeStreakDays } from '../workouts';

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

test('no workouts means no streak', () => {
  expect(computeStreakDays([])).toBe(0);
});

test('counts consecutive days ending today', () => {
  const days = [isoDaysAgo(0), isoDaysAgo(1), isoDaysAgo(2)];
  expect(computeStreakDays(days)).toBe(3);
});

test('still counts streak ending yesterday (today not logged yet)', () => {
  const days = [isoDaysAgo(1), isoDaysAgo(2)];
  expect(computeStreakDays(days)).toBe(2);
});

test('breaks streak on a gap', () => {
  const days = [isoDaysAgo(0), isoDaysAgo(2)];
  expect(computeStreakDays(days)).toBe(1);
});

test('resets to 0 if neither today nor yesterday logged', () => {
  const days = [isoDaysAgo(3), isoDaysAgo(4)];
  expect(computeStreakDays(days)).toBe(0);
});
