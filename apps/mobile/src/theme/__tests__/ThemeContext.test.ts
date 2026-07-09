import { darkColors, lightColors } from '../colors';
import { resolveColors } from '../ThemeContext';

test('system mode follows a dark OS scheme', () => {
  expect(resolveColors('system', 'dark')).toBe(darkColors);
});

test('system mode follows a light OS scheme', () => {
  expect(resolveColors('system', 'light')).toBe(lightColors);
});

test('system mode falls back to light when OS scheme is unknown', () => {
  expect(resolveColors('system', null)).toBe(lightColors);
});

test('light mode ignores the OS scheme', () => {
  expect(resolveColors('light', 'dark')).toBe(lightColors);
});

test('dark mode ignores the OS scheme', () => {
  expect(resolveColors('dark', 'light')).toBe(darkColors);
});
