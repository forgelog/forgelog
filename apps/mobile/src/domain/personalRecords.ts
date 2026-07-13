import type { ExerciseType } from './setFields';

export type RecordType = 'max_weight' | 'max_reps' | 'max_volume' | 'est_1rm';
export type RecordScope = 'set' | 'exercise_session';
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export type RecordSet = {
  id: string;
  position: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completedAt: string | null;
};

export type ExerciseOccurrence = {
  id: string;
  workoutId: string;
  exerciseId: string;
  exerciseType: ExerciseType;
  startedAt: string;
  position: number;
  sets: RecordSet[];
};

export type ComputedRecord = {
  type: RecordType;
  value: number;
  achievedAt: string;
  loggedSetId: string | null;
  workoutExerciseId: string;
  workoutId: string;
  formulaVersion?: string;
};

export type ComputedRecordEvent = ComputedRecord & {
  exerciseId: string;
  scope: RecordScope;
};

export type RecordState = {
  currentRecords: ComputedRecord[];
  events: ComputedRecordEvent[];
};

export type RecordStateOptions = {
  bodyweightKg?: number | null;
  fallbackAchievedAt?: string;
};

type Candidate = {
  type: RecordType;
  value: number;
  achievedAt: string;
  loggedSetId: string;
  workoutExerciseId: string;
  workoutId: string;
  formulaVersion?: string;
};

export type SetPerformance = {
  weight: number | null;
  reps: number | null;
};

const ESTIMATED_1RM_FORMULA_VERSION = 'hevy_percent_1_15_v1';

const ONE_REP_MAX_PERCENTAGES: Partial<Record<number, number>> = {
  1: 1,
  2: 0.95,
  3: 0.93,
  4: 0.9,
  5: 0.87,
  6: 0.86,
  7: 0.83,
  8: 0.81,
  9: 0.78,
  10: 0.75,
  11: 0.73,
  12: 0.71,
  13: 0.7,
  14: 0.68,
  15: 0.67,
};

export function estimateOneRepMax(weight: number, reps: number): number | null {
  const percentage = ONE_REP_MAX_PERCENTAGES[reps];
  return percentage == null ? null : weight / percentage;
}

export function effectiveLoadKg(input: {
  exerciseType: ExerciseType;
  weight: number | null;
  bodyweightKg?: number | null;
}): number | null {
  const { exerciseType, weight, bodyweightKg } = input;
  if (weight == null) return null;
  if (exerciseType === 'weighted_bodyweight') {
    return bodyweightKg == null ? null : bodyweightKg + weight;
  }
  if (exerciseType === 'assisted_bodyweight') {
    return bodyweightKg == null ? null : Math.max(0, bodyweightKg - weight);
  }
  return weight;
}

export function computeRecordState(
  occurrences: ExerciseOccurrence[],
  options: RecordStateOptions = {}
): RecordState {
  const fallbackAchievedAt = options.fallbackAchievedAt ?? new Date(0).toISOString();
  const current = new Map<RecordType, ComputedRecord>();
  const previous = new Map<RecordType, Candidate>();
  const events: ComputedRecordEvent[] = [];

  for (const occurrence of [...occurrences].sort(compareOccurrences)) {
    const occurrenceBest = bestCandidatesForOccurrence(occurrence, options.bodyweightKg ?? null, fallbackAchievedAt);
    for (const candidate of occurrenceBest) {
      updateCurrent(current, candidate);

      const historical = previous.get(candidate.type);
      if (historical && candidate.value > historical.value) {
        events.push({
          ...candidate,
          exerciseId: occurrence.exerciseId,
          scope: 'set',
        });
      }
    }

    for (const candidate of occurrenceBest) {
      updatePrevious(previous, candidate);
    }
  }

  return {
    currentRecords: [...current.values()].sort((a, b) => a.type.localeCompare(b.type)),
    events,
  };
}

export function computeRecords(sets: SetPerformance[]): Partial<Record<RecordType, number>> {
  const state = computeRecordState([
    {
      id: 'occurrence',
      workoutId: 'workout',
      exerciseId: 'exercise',
      exerciseType: inferExerciseType(sets),
      startedAt: new Date(0).toISOString(),
      position: 0,
      sets: sets.map((set, index) => ({
        id: `set-${index}`,
        position: index,
        setType: 'normal',
        weight: set.weight,
        reps: set.reps,
        durationSeconds: null,
        distanceMeters: null,
        completedAt: new Date(0).toISOString(),
      })),
    },
  ]);
  return Object.fromEntries(state.currentRecords.map((record) => [record.type, record.value])) as Partial<
    Record<RecordType, number>
  >;
}

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

function bestCandidatesForOccurrence(
  occurrence: ExerciseOccurrence,
  bodyweightKg: number | null,
  fallbackAchievedAt: string
): Candidate[] {
  const best = new Map<RecordType, Candidate>();
  for (const set of occurrence.sets) {
    if (!isEligibleSet(set)) continue;
    for (const candidate of candidatesForSet(occurrence, set, bodyweightKg, fallbackAchievedAt)) {
      updateCandidateMap(best, candidate);
    }
  }
  return [...best.values()];
}

function candidatesForSet(
  occurrence: ExerciseOccurrence,
  set: RecordSet,
  bodyweightKg: number | null,
  fallbackAchievedAt: string
): Candidate[] {
  const achievedAt = set.completedAt ?? fallbackAchievedAt;
  const base = {
    achievedAt,
    loggedSetId: set.id,
    workoutExerciseId: occurrence.id,
    workoutId: occurrence.workoutId,
  };
  const candidates: Candidate[] = [];
  const load = effectiveLoadKg({
    exerciseType: occurrence.exerciseType,
    weight: set.weight,
    bodyweightKg,
  });

  if (set.weight != null && allowsMaxWeight(occurrence.exerciseType)) {
    candidates.push({ ...base, type: 'max_weight', value: set.weight });
  }

  if (set.reps != null && allowsMaxReps(occurrence.exerciseType)) {
    candidates.push({ ...base, type: 'max_reps', value: set.reps });
  }

  if (load != null && set.reps != null && allowsVolume(occurrence.exerciseType)) {
    candidates.push({ ...base, type: 'max_volume', value: load * set.reps });
  }

  if (load != null && set.reps != null && allowsEstimatedOneRepMax(occurrence.exerciseType)) {
    const estimated = estimateOneRepMax(load, set.reps);
    if (estimated != null) {
      candidates.push({
        ...base,
        type: 'est_1rm',
        value: estimated,
        formulaVersion: ESTIMATED_1RM_FORMULA_VERSION,
      });
    }
  }

  return candidates;
}

function isEligibleSet(set: RecordSet): boolean {
  return set.setType !== 'warmup';
}

function allowsMaxWeight(type: ExerciseType): boolean {
  return (
    type === 'weight_reps' ||
    type === 'weighted_bodyweight' ||
    type === 'duration_weight' ||
    type === 'weight_distance'
  );
}

function allowsMaxReps(type: ExerciseType): boolean {
  return type === 'reps_only' || type === 'assisted_bodyweight';
}

function allowsVolume(type: ExerciseType): boolean {
  return type === 'weight_reps' || type === 'weighted_bodyweight' || type === 'assisted_bodyweight';
}

function allowsEstimatedOneRepMax(type: ExerciseType): boolean {
  return type === 'weight_reps' || type === 'weighted_bodyweight';
}

function updateCurrent(records: Map<RecordType, ComputedRecord>, candidate: Candidate): void {
  const existing = records.get(candidate.type);
  if (!existing || isBetter(candidate, existing)) {
    records.set(candidate.type, candidate);
  }
}

function updatePrevious(records: Map<RecordType, Candidate>, candidate: Candidate): void {
  const existing = records.get(candidate.type);
  if (!existing || isBetter(candidate, existing)) {
    records.set(candidate.type, candidate);
  }
}

function updateCandidateMap(records: Map<RecordType, Candidate>, candidate: Candidate): void {
  const existing = records.get(candidate.type);
  if (!existing || isBetter(candidate, existing)) {
    records.set(candidate.type, candidate);
  }
}

function isBetter(
  candidate: Pick<Candidate, 'value' | 'achievedAt' | 'loggedSetId'>,
  existing: Pick<ComputedRecord, 'value' | 'achievedAt' | 'loggedSetId'>
): boolean {
  return (
    candidate.value > existing.value ||
    (candidate.value === existing.value &&
      (candidate.achievedAt < existing.achievedAt ||
        (candidate.achievedAt === existing.achievedAt &&
          candidate.loggedSetId < (existing.loggedSetId ?? ''))))
  );
}

function compareOccurrences(a: ExerciseOccurrence, b: ExerciseOccurrence): number {
  return (
    a.startedAt.localeCompare(b.startedAt) ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

function inferExerciseType(sets: SetPerformance[]): ExerciseType {
  return sets.some((set) => set.weight != null) ? 'weight_reps' : 'reps_only';
}
