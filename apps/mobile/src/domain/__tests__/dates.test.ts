import { currentWeekDays, localDateKey } from '../dates';

test('localDateKey formats date in local time', () => {
  const d = new Date(2026, 6, 10); // local: July 10, 2026
  expect(localDateKey(d)).toBe('2026-07-10');
});

test('currentWeekDays starts on Monday and covers 7 days', () => {
  const thursday = new Date(2026, 6, 9); // Thursday July 9 2026
  const week = currentWeekDays(thursday);
  expect(week).toHaveLength(7);
  expect(localDateKey(week[0])).toBe('2026-07-06'); // Monday
  expect(localDateKey(week[6])).toBe('2026-07-12'); // Sunday
});

test('currentWeekDays when today is Sunday', () => {
  const sunday = new Date(2026, 6, 12); // Sunday July 12 2026
  const week = currentWeekDays(sunday);
  expect(localDateKey(week[0])).toBe('2026-07-06'); // Monday same week
  expect(localDateKey(week[6])).toBe('2026-07-12'); // Sunday = today
});
