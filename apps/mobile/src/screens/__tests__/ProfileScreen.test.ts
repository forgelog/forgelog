import { computeAge, initials } from '../ProfileScreen';

test('initials takes the first letter of the first two words', () => {
  expect(initials('Alex Rivera')).toBe('AR');
});

test('initials handles a single word', () => {
  expect(initials('Madonna')).toBe('M');
});

test('initials returns empty for an empty name', () => {
  expect(initials('')).toBe('');
  expect(initials('   ')).toBe('');
});

test('initials ignores extra whitespace and extra words', () => {
  expect(initials('  Alex   Rivera Jones  ')).toBe('AR');
});

// Builds a birth date relative to the real "today" so these assertions hold
// regardless of what day the suite happens to run on.
function isoDateNYearsAgo(years: number, dayOffset = 0): string {
  const d = new Date();
  const originalMonth = d.getMonth();
  d.setFullYear(d.getFullYear() - years);
  if (d.getMonth() !== originalMonth) {
    // Feb 29 rolled into March because the target year isn't a leap year;
    // clamp back to Feb 28 so the "exact birthday" case stays stable.
    d.setDate(0);
  }
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('computeAge returns the exact age on the birthday itself', () => {
  expect(computeAge(isoDateNYearsAgo(30))).toBe(30);
});

test('computeAge has not incremented yet the day before the birthday', () => {
  expect(computeAge(isoDateNYearsAgo(30, 1))).toBe(29);
});

test('computeAge has already incremented the day after the birthday', () => {
  expect(computeAge(isoDateNYearsAgo(30, -1))).toBe(30);
});
