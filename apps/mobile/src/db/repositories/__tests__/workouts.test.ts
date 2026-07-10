import { hasCompletedSet } from '../workouts';

test('hasCompletedSet is false for a workout with no exercises', () => {
  expect(hasCompletedSet([])).toBe(false);
});

test('hasCompletedSet is false when no set is completed', () => {
  expect(
    hasCompletedSet([
      { sets: [{ completed: false }, { completed: false }] },
      { sets: [] },
    ])
  ).toBe(false);
});

test('hasCompletedSet is true when at least one set is completed', () => {
  expect(
    hasCompletedSet([
      { sets: [{ completed: false }] },
      { sets: [{ completed: false }, { completed: true }] },
    ])
  ).toBe(true);
});
