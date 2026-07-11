export type SetFieldKey = 'weight' | 'reps' | 'duration' | 'distance';

export type TrackingType = 'weight_reps' | 'reps_only' | 'duration' | 'duration_distance';

export const TRACKING_TYPES: TrackingType[] = [
  'weight_reps',
  'reps_only',
  'duration',
  'duration_distance',
];

export const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps',
  duration: 'Time',
  duration_distance: 'Time + dist',
};

const FIELDS: Record<TrackingType, SetFieldKey[]> = {
  weight_reps: ['weight', 'reps'],
  reps_only: ['reps'],
  duration: ['duration'],
  duration_distance: ['duration', 'distance'],
};

// Resolve the type actually in effect: a per-context override wins over the
// catalog default; both may be null, in which case we default to weight × reps.
export function effectiveTrackingType(
  override: string | null,
  catalogDefault: string | null
): TrackingType {
  const value = override ?? catalogDefault ?? 'weight_reps';
  return TRACKING_TYPES.includes(value as TrackingType) ? (value as TrackingType) : 'weight_reps';
}

// tracking_type is null for seeded exercises — default to weight × reps.
export function fieldsFor(trackingType: string | null): SetFieldKey[] {
  return FIELDS[(trackingType as TrackingType) ?? 'weight_reps'] ?? FIELDS.weight_reps;
}

export const FIELD_PLACEHOLDER: Record<SetFieldKey, string> = {
  weight: 'kg',
  reps: 'reps',
  duration: 'sec',
  distance: 'm',
};

type SetLike = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
};

// Full display format with units, e.g. "80 kg × 8 reps" — used for read-only
// history views (workout detail, exercise history).
export function formatSet(trackingType: string | null, set: SetLike): string {
  return fieldsFor(trackingType)
    .map((field) => {
      switch (field) {
        case 'weight':
          return `${set.weight ?? '–'} kg`;
        case 'reps':
          return `${set.reps ?? '–'} reps`;
        case 'duration':
          return `${set.duration_seconds ?? '–'} s`;
        case 'distance':
          return `${set.distance_meters ?? '–'} m`;
      }
    })
    .join(' × ');
}

// Compact, unit-less format, e.g. "77.5 × 8" — used for the narrow PREV
// column while actively logging a set.
export function formatCompactSet(trackingType: string | null, set: SetLike): string | null {
  const fields = fieldsFor(trackingType);
  const values = fields.map((field) => {
    switch (field) {
      case 'weight':
        return set.weight;
      case 'reps':
        return set.reps;
      case 'duration':
        return set.duration_seconds;
      case 'distance':
        return set.distance_meters;
    }
  });
  if (values.some((v) => v == null)) return null;
  return values.join(' × ');
}

// Parses a numeric text input, rejecting negative and non-finite values
// (e.g. "-5", "Infinity", "abc"). Returns null when the field was
// intentionally cleared, or undefined when the input should be rejected.
export function parseNonNegativeNumber(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

// Same as parseNonNegativeNumber but also rejects decimals — for
// integer-only fields like reps, duration, and rest seconds.
export function parseNonNegativeInteger(raw: string): number | null | undefined {
  const value = parseNonNegativeNumber(raw);
  if (value == null) return value;
  return Number.isInteger(value) ? value : undefined;
}

// The field whose value proves a set was actually performed, per tracking
// type — weight is never required so bodyweight sets stay valid.
const LOGGED_VALUE_FIELD: Record<TrackingType, 'reps' | 'duration_seconds'> = {
  weight_reps: 'reps',
  reps_only: 'reps',
  duration: 'duration_seconds',
  duration_distance: 'duration_seconds',
};

export function hasLoggedValue(trackingType: string | null, set: SetLike): boolean {
  const field = LOGGED_VALUE_FIELD[(trackingType as TrackingType) ?? 'weight_reps'] ?? 'reps';
  return (set[field] ?? 0) > 0;
}

export const DEFAULT_REST_SECONDS = 90;

// Per-exercise rest_seconds (snapshotted onto workout_exercises at workout
// start) wins; null falls back to the default rest duration.
export function resolveRestSeconds(
  restSeconds: number | null,
  defaultSeconds: number = DEFAULT_REST_SECONDS
): number {
  return restSeconds ?? defaultSeconds;
}
