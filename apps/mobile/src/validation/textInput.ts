// Name-like fields (profile name, routine name): short, single line.
export const NAME_MAX_LENGTH = 100;
// Notes-like fields (routine notes): longer, free-form, multiline.
export const NOTES_MAX_LENGTH = 1000;

// Control chars (incl. DEL) minus the ones we allow through: \n for multiline fields.
const CONTROL_CHARS_STRIP_ALL = /[\x00-\x1F\x7F]/g;
const CONTROL_CHARS_STRIP_KEEP_NEWLINE = /[\x00-\x09\x0B-\x1F\x7F]/g;

export function sanitizeText(value: string, multiline = false): string {
  const pattern = multiline ? CONTROL_CHARS_STRIP_KEEP_NEWLINE : CONTROL_CHARS_STRIP_ALL;
  return value.replace(pattern, '').trim();
}

export type ValidateTextOptions = {
  maxLength: number;
  required?: boolean;
  fieldLabel: string;
  multiline?: boolean;
};

export type ValidateTextResult = {
  value: string;
  error: string | null;
};

export function validateText(value: string, opts: ValidateTextOptions): ValidateTextResult {
  const { maxLength, required = false, fieldLabel, multiline = false } = opts;
  const sanitized = sanitizeText(value, multiline);

  if (required && sanitized.length === 0) {
    return { value: sanitized, error: `${fieldLabel} is required.` };
  }

  if (sanitized.length > maxLength) {
    return {
      value: sanitized,
      error: `${fieldLabel} must be ${maxLength} characters or fewer.`,
    };
  }

  return { value: sanitized, error: null };
}
