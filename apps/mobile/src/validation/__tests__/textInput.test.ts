import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, sanitizeText, validateText } from '../textInput';

describe('sanitizeText', () => {
  test('trims leading and trailing whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  test('strips control characters', () => {
    expect(sanitizeText('a\x00b\x1Fc\x7Fd')).toBe('abcd');
  });

  test('strips newlines by default (single-line mode)', () => {
    expect(sanitizeText('line1\nline2')).toBe('line1line2');
  });

  test('keeps newlines when multiline is true', () => {
    expect(sanitizeText('line1\nline2', true)).toBe('line1\nline2');
  });

  test('still strips other control chars when multiline is true', () => {
    expect(sanitizeText('a\x00\nb', true)).toBe('a\nb');
  });

  test('strips carriage returns even in multiline mode', () => {
    expect(sanitizeText('line1\r\nline2\rline3', true)).toBe('line1\nline2line3');
  });
});

describe('validateText', () => {
  test('valid input returns trimmed value with no error', () => {
    const result = validateText('  Push Day  ', { maxLength: NAME_MAX_LENGTH, fieldLabel: 'Name' });
    expect(result).toEqual({ value: 'Push Day', error: null });
  });

  test('empty string with required: true errors', () => {
    const result = validateText('', {
      maxLength: NAME_MAX_LENGTH,
      required: true,
      fieldLabel: 'Routine name',
    });
    expect(result.error).toBe('Routine name is required.');
  });

  test('whitespace-only value is treated as empty when required', () => {
    const result = validateText('   ', {
      maxLength: NAME_MAX_LENGTH,
      required: true,
      fieldLabel: 'Routine name',
    });
    expect(result.error).toBe('Routine name is required.');
    expect(result.value).toBe('');
  });

  test('empty value is fine when not required', () => {
    const result = validateText('', { maxLength: NOTES_MAX_LENGTH, fieldLabel: 'Notes' });
    expect(result).toEqual({ value: '', error: null });
  });

  test('value over max length errors', () => {
    const long = 'a'.repeat(NAME_MAX_LENGTH + 1);
    const result = validateText(long, { maxLength: NAME_MAX_LENGTH, fieldLabel: 'Name' });
    expect(result.error).toBe(`Name must be ${NAME_MAX_LENGTH} characters or fewer.`);
  });

  test('value exactly at max length is valid', () => {
    const exact = 'a'.repeat(NAME_MAX_LENGTH);
    const result = validateText(exact, { maxLength: NAME_MAX_LENGTH, fieldLabel: 'Name' });
    expect(result.error).toBeNull();
    expect(result.value).toBe(exact);
  });

  test('strips control characters before validating', () => {
    const result = validateText('Push\x00Day', { maxLength: NAME_MAX_LENGTH, fieldLabel: 'Name' });
    expect(result.value).toBe('PushDay');
    expect(result.error).toBeNull();
  });

  test('single-line fields strip embedded newlines', () => {
    const result = validateText('Push\nDay', { maxLength: NAME_MAX_LENGTH, fieldLabel: 'Name' });
    expect(result.value).toBe('PushDay');
  });

  test('multiline fields keep embedded newlines', () => {
    const result = validateText('Line one\nLine two', {
      maxLength: NOTES_MAX_LENGTH,
      fieldLabel: 'Notes',
      multiline: true,
    });
    expect(result.value).toBe('Line one\nLine two');
    expect(result.error).toBeNull();
  });
});
