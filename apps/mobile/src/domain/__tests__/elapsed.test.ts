import { formatElapsed } from '../elapsed';

test('formats elapsed workout time as hh:mm:ss', () => {
  expect(formatElapsed(0)).toBe('00:00:00');
  expect(formatElapsed(9)).toBe('00:00:09');
  expect(formatElapsed(65)).toBe('00:01:05');
  expect(formatElapsed(3599)).toBe('00:59:59');
  expect(formatElapsed(3600)).toBe('01:00:00');
  expect(formatElapsed(3661)).toBe('01:01:01');
});

test('clamps negative elapsed time to zero', () => {
  expect(formatElapsed(-5)).toBe('00:00:00');
});
