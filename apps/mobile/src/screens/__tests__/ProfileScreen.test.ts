import { initials } from '../ProfileScreen';

test('initials takes the first letter of the first two words', () => {
  expect(initials('Alex Rivera')).toBe('AR');
});

test('initials handles a single word', () => {
  expect(initials('Madonna')).toBe('M');
});

test('initials falls back to AR for an empty name', () => {
  expect(initials('')).toBe('AR');
  expect(initials('   ')).toBe('AR');
});

test('initials ignores extra whitespace and extra words', () => {
  expect(initials('  Alex   Rivera Jones  ')).toBe('AR');
});
