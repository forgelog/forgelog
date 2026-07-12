import seedData from '../exercises.seed.json';
import { normalizeExerciseType } from '../../domain/setFields';
import { RawSeedExercise, toExerciseRow } from '../seed';

const sample: RawSeedExercise = {
  id: '3_4_Sit-Up',
  name: '3/4 Sit-Up',
  equipment: 'body only',
  primaryMuscles: ['abdominals'],
  secondaryMuscles: ['calves'],
  instructions: ['Lie down.', 'Sit up.'],
  images: ['https://example.com/0.jpg', 'https://example.com/1.jpg'],
  exercise_type: 'reps_only',
};

test('maps primaryMuscles[0] to muscle_group', () => {
  expect(toExerciseRow(sample).muscle_group).toBe('abdominals');
});

test('serialises instructions and images as JSON arrays', () => {
  const row = toExerciseRow(sample);
  expect(JSON.parse(row.instructions!)).toEqual(['Lie down.', 'Sit up.']);
  expect(JSON.parse(row.images!)).toEqual([
    'https://example.com/0.jpg',
    'https://example.com/1.jpg',
  ]);
});

test('seeds are non-custom with required exercise_type', () => {
  const row = toExerciseRow(sample);
  expect(row.is_custom).toBe(0);
  expect(row.exercise_type).toBe('reps_only');
});

test('falls back to "other" when equipment is null', () => {
  expect(toExerciseRow({ ...sample, equipment: null }).equipment).toBe('other');
});

test('serialises secondaryMuscles as a JSON array', () => {
  const row = toExerciseRow(sample);
  expect(JSON.parse(row.secondary_muscles!)).toEqual(['calves']);
});

test('defaults secondaryMuscles to an empty array when absent', () => {
  const { secondaryMuscles, ...rest } = sample;
  const row = toExerciseRow(rest as RawSeedExercise);
  expect(JSON.parse(row.secondary_muscles!)).toEqual([]);
});

test('every bundled exercise transforms into a valid row', () => {
  const rows = (seedData as RawSeedExercise[]).map(toExerciseRow);
  expect(rows).toHaveLength(873);
  for (const row of rows) {
    expect(row.id).toBeTruthy();
    expect(row.name).toBeTruthy();
    expect(row.muscle_group).toBeTruthy();
    expect(row.equipment).toBeTruthy();
    expect(normalizeExerciseType(row.exercise_type)).toBe(row.exercise_type);
    expect(() => JSON.parse(row.instructions!)).not.toThrow();
    expect(() => JSON.parse(row.images!)).not.toThrow();
    expect(() => JSON.parse(row.secondary_muscles!)).not.toThrow();
  }
});
