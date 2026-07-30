export type WorkoutWriter = 'phone' | 'watch';

export type EntryVersion = {
  changed_at_ms: number;
  writer: WorkoutWriter;
};

export type VersionedValue<T> = {
  version: EntryVersion;
  value: T;
};

export type ActiveWorkoutFields = {
  routine_id: VersionedValue<string | null>;
  routine_structure_version: VersionedValue<number | null>;
  name: VersionedValue<string>;
  notes: VersionedValue<string | null>;
  bodyweight_kg: VersionedValue<number | null>;
};

export type WorkoutExerciseFields = {
  exercise_id: string;
  exercise_name: string;
  source_routine_exercise_id: string | null;
  superset_group_id: string | null;
  exercise_type: string;
  notes: string | null;
};

export type LoggedSetFields = {
  source_routine_set_id: string | null;
  set_type: string;
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  completed: boolean;
  completed_at_ms: number | null;
};

export type ActiveLoggedSet = {
  id: string;
  version: EntryVersion;
  deleted: boolean;
  position: number | null;
  value: LoggedSetFields | null;
};

export type ActiveWorkoutExercise = {
  id: string;
  version: EntryVersion;
  deleted: boolean;
  position: number | null;
  value: WorkoutExerciseFields | null;
  sets: ActiveLoggedSet[];
};

export type ActiveWorkoutBody = {
  fields: ActiveWorkoutFields;
  exercises: ActiveWorkoutExercise[];
};

export type LoggedSetBody = LoggedSetFields & { id: string };

export type WorkoutExerciseBody = WorkoutExerciseFields & {
  id: string;
  sets: LoggedSetBody[];
};

export type WorkoutBody = {
  routine_id: string | null;
  routine_structure_version: number | null;
  name: string;
  notes: string | null;
  bodyweight_kg: number | null;
  exercises: WorkoutExerciseBody[];
};

export type WorkoutReplica = {
  workout_id: string;
  started_at_ms: number;
  changed_at_ms: number;
  state:
    | { kind: 'active'; workout: ActiveWorkoutBody }
    | { kind: 'finished'; ended_at_ms: number; workout: WorkoutBody }
    | { kind: 'discarded' };
};

export type AuthoredWorkoutReplica = {
  writer: WorkoutWriter;
  replica: WorkoutReplica;
};

export type WorkoutReceipt = {
  workout_id: string;
  watch_started_at_ms: number;
  watch_changed_at_ms: number;
};

export type WorkoutMailbox = {
  protocol_version: 1;
  candidate: WorkoutReplica | null;
  watch_receipt: WorkoutReceipt | null;
};

/** Canonical UTF-16 code-unit order, matching Kotlin String.compareTo. */
export function compareCanonicalStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareEntryVersions(left: EntryVersion, right: EntryVersion): number {
  if (left.changed_at_ms !== right.changed_at_ms) {
    return left.changed_at_ms - right.changed_at_ms;
  }
  return compareCanonicalStrings(left.writer, right.writer);
}

function greaterVersioned<T>(left: VersionedValue<T>, right: VersionedValue<T>): VersionedValue<T> {
  return compareEntryVersions(left.version, right.version) >= 0 ? left : right;
}

function mergeById<T extends { id: string }>(
  left: readonly T[],
  right: readonly T[],
  merge: (left: T, right: T) => T
): T[] {
  const entries = new Map<string, T>();
  for (const entry of left) entries.set(entry.id, entry);
  for (const entry of right) {
    const existing = entries.get(entry.id);
    entries.set(entry.id, existing ? merge(existing, entry) : entry);
  }
  return [...entries.values()].sort((a, b) => compareCanonicalStrings(a.id, b.id));
}

function joinSets(left: ActiveLoggedSet[], right: ActiveLoggedSet[]): ActiveLoggedSet[] {
  return mergeById(left, right, (a, b) =>
    compareEntryVersions(a.version, b.version) >= 0 ? a : b
  );
}

function joinExercises(
  left: ActiveWorkoutExercise[],
  right: ActiveWorkoutExercise[]
): ActiveWorkoutExercise[] {
  return mergeById(left, right, (a, b) => {
    const winner = compareEntryVersions(a.version, b.version) >= 0 ? a : b;
    return { ...winner, sets: joinSets(a.sets, b.sets) };
  });
}

export function joinActiveWorkoutBodies(
  left: ActiveWorkoutBody,
  right: ActiveWorkoutBody
): ActiveWorkoutBody {
  return {
    fields: {
      routine_id: greaterVersioned(left.fields.routine_id, right.fields.routine_id),
      routine_structure_version: greaterVersioned(
        left.fields.routine_structure_version,
        right.fields.routine_structure_version
      ),
      name: greaterVersioned(left.fields.name, right.fields.name),
      notes: greaterVersioned(left.fields.notes, right.fields.notes),
      bodyweight_kg: greaterVersioned(left.fields.bodyweight_kg, right.fields.bodyweight_kg),
    },
    exercises: joinExercises(left.exercises, right.exercises),
  };
}

function byDisplayPosition<T extends { id: string; position: number | null }>(a: T, b: T): number {
  return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
    compareCanonicalStrings(a.id, b.id);
}

export function materializeActiveWorkout(body: ActiveWorkoutBody): WorkoutBody {
  return {
    routine_id: body.fields.routine_id.value,
    routine_structure_version: body.fields.routine_structure_version.value,
    name: body.fields.name.value,
    notes: body.fields.notes.value,
    bodyweight_kg: body.fields.bodyweight_kg.value,
    exercises: body.exercises
      .filter(
        (exercise): exercise is ActiveWorkoutExercise & {
          position: number;
          value: WorkoutExerciseFields;
        } => !exercise.deleted && exercise.position !== null && exercise.value !== null
      )
      .sort(byDisplayPosition)
      .map((exercise) => ({
        id: exercise.id,
        ...exercise.value,
        sets: exercise.sets
          .filter(
            (set): set is ActiveLoggedSet & { position: number; value: LoggedSetFields } =>
              !set.deleted && set.position !== null && set.value !== null
          )
          .sort(byDisplayPosition)
          .map((set) => ({ id: set.id, ...set.value })),
      })),
  };
}

function lifecycleRank(replica: WorkoutReplica): number {
  switch (replica.state.kind) {
    case 'active':
      return 0;
    case 'discarded':
      return 1;
    case 'finished':
      return 2;
  }
}

function compareEnvelopes(left: AuthoredWorkoutReplica, right: AuthoredWorkoutReplica): number {
  return (
    left.replica.changed_at_ms - right.replica.changed_at_ms ||
    compareCanonicalStrings(left.writer, right.writer)
  );
}

export function canonicalWorkoutContentEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value === null || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort(compareCanonicalStrings)
      .map((key) => [key, canonicalizeJson(object[key])])
  );
}

export function activeBodyDominates(left: ActiveWorkoutBody, right: ActiveWorkoutBody): boolean {
  return canonicalWorkoutContentEqual(joinActiveWorkoutBodies(left, right), left);
}

export function resolveSameWorkout(
  stored: AuthoredWorkoutReplica,
  incoming: AuthoredWorkoutReplica,
  localWriter: WorkoutWriter,
  joinedChangedAtMs: number
): AuthoredWorkoutReplica {
  if (
    stored.replica.workout_id !== incoming.replica.workout_id ||
    stored.replica.started_at_ms !== incoming.replica.started_at_ms
  ) {
    throw new Error('Cannot resolve different workout generations');
  }

  const storedRank = lifecycleRank(stored.replica);
  const incomingRank = lifecycleRank(incoming.replica);
  if (storedRank !== incomingRank) return storedRank > incomingRank ? stored : incoming;
  if (stored.replica.state.kind !== 'active' || incoming.replica.state.kind !== 'active') {
    return compareEnvelopes(stored, incoming) >= 0 ? stored : incoming;
  }

  const joined = joinActiveWorkoutBodies(stored.replica.state.workout, incoming.replica.state.workout);
  const equalsStored = canonicalWorkoutContentEqual(joined, stored.replica.state.workout);
  const equalsIncoming = canonicalWorkoutContentEqual(joined, incoming.replica.state.workout);
  if (equalsStored && equalsIncoming) return compareEnvelopes(stored, incoming) >= 0 ? stored : incoming;
  if (equalsStored) return stored;
  if (equalsIncoming) return incoming;

  return {
    writer: localWriter,
    replica: {
      workout_id: stored.replica.workout_id,
      started_at_ms: stored.replica.started_at_ms,
      changed_at_ms: Math.max(
        joinedChangedAtMs,
        stored.replica.changed_at_ms + 1,
        incoming.replica.changed_at_ms + 1
      ),
      state: { kind: 'active', workout: joined },
    },
  };
}

export function selectCurrentGeneration(
  replicas: readonly AuthoredWorkoutReplica[]
): AuthoredWorkoutReplica | null {
  return (
    replicas.reduce<AuthoredWorkoutReplica | null>((selected, candidate) => {
      if (!selected) return candidate;
      const startComparison = candidate.replica.started_at_ms - selected.replica.started_at_ms;
      if (startComparison !== 0) return startComparison > 0 ? candidate : selected;
      return compareCanonicalStrings(candidate.replica.workout_id, selected.replica.workout_id) > 0
        ? candidate
        : selected;
    }, null)
  );
}

export function selectOutboundCandidate(
  writer: WorkoutWriter,
  state: {
    pending_finished: readonly WorkoutReplica[];
    transport_intent: WorkoutReplica | null;
  }
): WorkoutReplica | null {
  if (writer === 'watch' && state.pending_finished.length > 0) {
    return state.pending_finished[0];
  }
  return state.transport_intent;
}
