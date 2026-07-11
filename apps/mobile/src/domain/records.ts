export type RecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';

export type SetPerformance = {
  weight: number | null;
  reps: number | null;
};

// Epley estimated 1RM: weight * (1 + reps / 30).
export function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Pure PR computation over completed sets for a single exercise. Returns only
// the record types that have a value (an exercise with no weighted sets won't
// produce a max_weight, etc.).
export function computeRecords(sets: SetPerformance[]): Partial<Record<RecordType, number>> {
  const records: Partial<Record<RecordType, number>> = {};
  for (const set of sets) {
    if (set.weight != null) {
      records.max_weight = Math.max(records.max_weight ?? 0, set.weight);
    }
    if (set.reps != null) {
      records.max_reps = Math.max(records.max_reps ?? 0, set.reps);
    }
    if (set.weight != null && set.reps != null) {
      records.max_volume = Math.max(records.max_volume ?? 0, set.weight * set.reps);
      records.est_1rm = Math.max(records.est_1rm ?? 0, estimatedOneRepMax(set.weight, set.reps));
    }
  }
  return records;
}

// Flags a completed set as a PR if it matches one of the exercise's current
// record values — used to badge past sessions in exercise history.
export function isPrSet(
  set: { weight: number | null; reps: number | null; completed: boolean },
  records: Partial<Record<RecordType, number>>
): boolean {
  if (!set.completed) return false;
  if (set.weight != null && set.weight === records.max_weight) return true;
  if (set.reps != null && records.max_reps != null && set.reps === records.max_reps) return true;
  if (
    set.weight != null &&
    set.reps != null &&
    records.max_volume != null &&
    set.weight * set.reps === records.max_volume
  ) {
    return true;
  }
  return false;
}
