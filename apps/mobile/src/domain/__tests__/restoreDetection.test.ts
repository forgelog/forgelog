import { classifyLaunch } from '../restoreDetection';

test('adopts the marker when the database has no installation yet', () => {
  expect(classifyLaunch('install-a', null)).toBe('adopt');
});

test('treats a matching installation as a normal launch', () => {
  expect(classifyLaunch('install-a', 'install-a')).toBe('normal');
});

test('treats a database from another installation as restored', () => {
  expect(classifyLaunch('install-b', 'install-a')).toBe('restored');
});
