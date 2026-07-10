import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_MIN_KG,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  parseIsoDate,
  toIsoDate,
  validateBirthDate,
  validateBirthDateIso,
  validateNumber,
} from '../numericInput';

describe('validateNumber', () => {
  test('accepts a value within range', () => {
    expect(validateNumber(180, { min: HEIGHT_MIN_CM, max: HEIGHT_MAX_CM, fieldLabel: 'Height' })).toEqual({
      value: 180,
      error: null,
    });
  });

  test('treats null as unset, not an error', () => {
    expect(validateNumber(null, { min: HEIGHT_MIN_CM, max: HEIGHT_MAX_CM, fieldLabel: 'Height' })).toEqual({
      value: null,
      error: null,
    });
  });

  test('rejects a value below the minimum', () => {
    const { error } = validateNumber(10, { min: HEIGHT_MIN_CM, max: HEIGHT_MAX_CM, fieldLabel: 'Height' });
    expect(error).toMatch(/between 50 and 250/);
  });

  test('rejects a value above the maximum', () => {
    const { error } = validateNumber(999, {
      min: BODYWEIGHT_MIN_KG,
      max: BODYWEIGHT_MAX_KG,
      fieldLabel: 'Bodyweight',
    });
    expect(error).toMatch(/between 20 and 400/);
  });

  test('rejects NaN', () => {
    const { error } = validateNumber(NaN, { min: HEIGHT_MIN_CM, max: HEIGHT_MAX_CM, fieldLabel: 'Height' });
    expect(error).toBe('Height must be a number.');
  });
});

describe('validateBirthDate', () => {
  test('treats null as unset, not an error', () => {
    expect(validateBirthDate(null)).toEqual({ value: null, error: null });
  });

  test('accepts a valid past date and returns an ISO YYYY-MM-DD string', () => {
    const date = new Date(1990, 5, 15);
    expect(validateBirthDate(date)).toEqual({ value: '1990-06-15', error: null });
  });

  test('rejects a date in the future', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { error } = validateBirthDate(future);
    expect(error).toBe('Birth date cannot be in the future.');
  });

  test('rejects a date before 1900', () => {
    const tooOld = new Date(1899, 11, 31);
    const { error } = validateBirthDate(tooOld);
    expect(error).toBe('Birth date must be after 1900.');
  });

  test('rejects an invalid Date', () => {
    const { error } = validateBirthDate(new Date(NaN));
    expect(error).toBe('Birth date is invalid.');
  });
});

describe('toIsoDate / parseIsoDate', () => {
  test('round-trips a local calendar date without shifting days', () => {
    const date = new Date(2000, 0, 1); // Jan 1, 2000, local midnight
    const iso = toIsoDate(date);
    expect(iso).toBe('2000-01-01');

    const parsed = parseIsoDate(iso);
    expect(parsed.getFullYear()).toBe(2000);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(1);
  });
});

describe('validateBirthDateIso', () => {
  test('treats null as unset, not an error', () => {
    expect(validateBirthDateIso(null)).toEqual({ value: null, error: null });
  });

  test('accepts a valid ISO date string', () => {
    expect(validateBirthDateIso('1990-06-15')).toEqual({ value: '1990-06-15', error: null });
  });

  test('rejects an ISO date string before 1900', () => {
    const { error } = validateBirthDateIso('1899-12-31');
    expect(error).toBe('Birth date must be after 1900.');
  });

  test('rejects a calendar date that does not exist', () => {
    const { error } = validateBirthDateIso('2021-02-30');
    expect(error).toBe('Birth date is invalid.');
  });
});
