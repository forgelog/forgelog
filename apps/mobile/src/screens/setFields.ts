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
  return (override ?? catalogDefault ?? 'weight_reps') as TrackingType;
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
