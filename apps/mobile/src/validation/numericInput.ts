export const HEIGHT_MIN_CM = 50;
export const HEIGHT_MAX_CM = 250;
export const BODYWEIGHT_MIN_KG = 20;
export const BODYWEIGHT_MAX_KG = 400;
const BIRTH_DATE_MIN_YEAR = 1900;

export type ValidateNumberOptions = {
  min: number;
  max: number;
  fieldLabel: string;
};

export type ValidateNumberResult = {
  value: number | null;
  error: string | null;
};

export function validateNumber(
  value: number | null,
  opts: ValidateNumberOptions
): ValidateNumberResult {
  const { min, max, fieldLabel } = opts;

  if (value === null) {
    return { value: null, error: null };
  }

  if (Number.isNaN(value)) {
    return { value, error: `${fieldLabel} must be a number.` };
  }

  if (value < min || value > max) {
    return { value, error: `${fieldLabel} must be between ${min} and ${max}.` };
  }

  return { value, error: null };
}

export type ValidateDateResult = {
  value: string | null;
  error: string | null;
};

export function validateBirthDate(date: Date | null): ValidateDateResult {
  if (date === null) {
    return { value: null, error: null };
  }

  if (Number.isNaN(date.getTime())) {
    return { value: null, error: 'Birth date is invalid.' };
  }

  if (date.getTime() > Date.now()) {
    return { value: null, error: 'Birth date cannot be in the future.' };
  }

  if (date.getFullYear() < BIRTH_DATE_MIN_YEAR) {
    return { value: null, error: 'Birth date must be after 1900.' };
  }

  return { value: toIsoDate(date), error: null };
}

export function validateBirthDateIso(iso: string | null): ValidateDateResult {
  if (iso === null) {
    return { value: null, error: null };
  }
  const date = parseIsoDate(iso);
  // JS Date normalizes out-of-range components (e.g. 2021-02-30 rolls over
  // to March 2) instead of erroring, so round-trip through toIsoDate to
  // catch calendar dates that don't actually exist.
  if (!Number.isNaN(date.getTime()) && toIsoDate(date) !== iso) {
    return { value: null, error: 'Birth date is invalid.' };
  }
  return validateBirthDate(date);
}

// Deliberately local-time throughout: the native date picker returns a Date
// representing the selected calendar date at local midnight, so parsing and
// formatting must stay in local time too, or the day shifts by one for any
// non-zero UTC offset.
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
