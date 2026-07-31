import Ajv from 'ajv';

import {
  canonicalWorkoutContentEqual,
  compareCanonicalStrings,
  type ActiveLoggedSet,
  type ActiveWorkoutBody,
  type ActiveWorkoutExercise,
  type AuthoredWorkoutReplica,
  type EntryVersion,
  type WorkoutMailbox,
  type WorkoutReceipt,
  type WorkoutReplica,
  type WorkoutWriter,
} from '../domain/workoutReplicaSync';

const contractSchema = require('../../../../data/contracts/sync.schema.json');

const ajv = new Ajv();
const validateReplicaShape = ajv.compile<WorkoutReplica>({
  ...contractSchema.definitions.WorkoutReplica,
  definitions: contractSchema.definitions,
});
const validateReceiptShape = ajv.compile<WorkoutReceipt>({
  ...contractSchema.definitions.WorkoutReceipt,
  definitions: contractSchema.definitions,
});

function isOuterMailbox(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort(compareCanonicalStrings);
  return (
    keys.length === 3 &&
    keys[0] === 'candidate' &&
    keys[1] === 'protocol_version' &&
    keys[2] === 'watch_receipt' &&
    (value as Record<string, unknown>).protocol_version === 1
  );
}

function isCanonicalById(values: readonly { id: string }[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1].id < value.id);
}

function versionIsWithinEnvelope(version: EntryVersion, envelopeChangedAtMs: number): boolean {
  return version.changed_at_ms <= envelopeChangedAtMs;
}

function isValidSet(set: ActiveLoggedSet, envelopeChangedAtMs: number): boolean {
  if (!versionIsWithinEnvelope(set.version, envelopeChangedAtMs)) return false;
  if (set.deleted) return set.position === null && set.value === null;
  if (set.position === null || set.position < 0 || set.value === null) return false;
  return set.value.completed || set.value.completed_at_ms === null;
}

function isValidExercise(
  exercise: ActiveWorkoutExercise,
  envelopeChangedAtMs: number
): boolean {
  if (!versionIsWithinEnvelope(exercise.version, envelopeChangedAtMs)) return false;
  if (!isCanonicalById(exercise.sets)) return false;
  if (!exercise.sets.every((set) => isValidSet(set, envelopeChangedAtMs))) return false;
  if (exercise.deleted) return exercise.position === null && exercise.value === null;
  return exercise.position !== null && exercise.position >= 0 && exercise.value !== null;
}

function isValidActiveBody(body: ActiveWorkoutBody, envelopeChangedAtMs: number): boolean {
  const fieldVersions = Object.values(body.fields).map((field) => field.version);
  if (!fieldVersions.every((version) => versionIsWithinEnvelope(version, envelopeChangedAtMs))) {
    return false;
  }
  if (!isCanonicalById(body.exercises)) return false;
  if (!body.exercises.every((exercise) => isValidExercise(exercise, envelopeChangedAtMs))) {
    return false;
  }
  const setIds = body.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
  return new Set(setIds).size === setIds.length;
}

function hasValidFinishedCompletion(replica: WorkoutReplica): boolean {
  if (replica.state.kind !== 'finished') return true;
  return replica.state.workout.exercises.every((exercise) =>
    exercise.sets.every((set) => set.completed || set.completed_at_ms === null)
  );
}

function versionsEqual(left: EntryVersion, right: EntryVersion): boolean {
  return left.changed_at_ms === right.changed_at_ms && left.writer === right.writer;
}

function entryReusesVersion<T extends { version: EntryVersion }>(incoming: T, known?: T): boolean {
  return (
    known !== undefined &&
    versionsEqual(incoming.version, known.version) &&
    !canonicalWorkoutContentEqual(incoming, known)
  );
}

function fieldsDoNotReuseVersion(incoming: ActiveWorkoutBody, known: ActiveWorkoutBody): boolean {
  return (Object.keys(incoming.fields) as (keyof ActiveWorkoutBody['fields'])[]).every((key) => {
    return !entryReusesVersion(incoming.fields[key], known.fields[key]);
  });
}

function exerciseReusesVersion(
  incoming: ActiveWorkoutExercise,
  known?: ActiveWorkoutExercise
): boolean {
  if (!known || !versionsEqual(incoming.version, known.version)) return false;
  return !canonicalWorkoutContentEqual(
    { ...incoming, sets: undefined },
    { ...known, sets: undefined }
  );
}

function exerciseSetsDoNotReuseVersion(
  incoming: ActiveWorkoutExercise,
  known: ActiveWorkoutExercise | undefined,
  knownSetParents: ReadonlyMap<string, string>
): boolean {
  const knownSets = new Map(known?.sets.map((set) => [set.id, set]) ?? []);
  return incoming.sets.every((set) => {
    const knownParent = knownSetParents.get(set.id);
    if (knownParent !== undefined && knownParent !== incoming.id) return false;
    return !entryReusesVersion(set, knownSets.get(set.id));
  });
}

function entriesDoNotReuseVersion(
  incoming: ActiveWorkoutBody,
  known: ActiveWorkoutBody
): boolean {
  if (!fieldsDoNotReuseVersion(incoming, known)) return false;

  const knownExercises = new Map(known.exercises.map((exercise) => [exercise.id, exercise]));
  const knownSetParents = new Map<string, string>();
  for (const exercise of known.exercises) {
    for (const set of exercise.sets) knownSetParents.set(set.id, exercise.id);
  }
  for (const exercise of incoming.exercises) {
    const knownExercise = knownExercises.get(exercise.id);
    if (exerciseReusesVersion(exercise, knownExercise)) return false;
    if (!exerciseSetsDoNotReuseVersion(exercise, knownExercise, knownSetParents)) return false;
  }
  return true;
}

function isCompatibleWithKnownReplica(
  pathWriter: WorkoutWriter,
  replica: WorkoutReplica,
  known: AuthoredWorkoutReplica
): boolean {
  if (known.replica.workout_id !== replica.workout_id) return true;
  if (known.replica.started_at_ms !== replica.started_at_ms) return false;
  if (
    known.writer === pathWriter &&
    known.replica.changed_at_ms === replica.changed_at_ms &&
    !canonicalWorkoutContentEqual(known.replica, replica)
  ) {
    return false;
  }
  if (known.replica.state.kind !== 'active' || replica.state.kind !== 'active') return true;
  return entriesDoNotReuseVersion(replica.state.workout, known.replica.state.workout);
}

function isSemanticallyValidReplica(
  pathWriter: WorkoutWriter,
  replica: WorkoutReplica,
  knownState: readonly AuthoredWorkoutReplica[]
): boolean {
  if (replica.state.kind === 'finished' && replica.state.ended_at_ms < replica.started_at_ms) {
    return false;
  }
  if (replica.state.kind === 'active' && !isValidActiveBody(replica.state.workout, replica.changed_at_ms)) {
    return false;
  }
  if (!hasValidFinishedCompletion(replica)) return false;

  return knownState.every((known) => isCompatibleWithKnownReplica(pathWriter, replica, known));
}

export function validateWorkoutMailbox(
  pathWriter: WorkoutWriter,
  value: unknown,
  knownState: readonly AuthoredWorkoutReplica[]
): WorkoutMailbox | null {
  if (!isOuterMailbox(value)) return null;
  const rawCandidate = value.candidate;
  const rawReceipt = value.watch_receipt;
  if (pathWriter === 'watch' && rawReceipt !== null) return null;
  const receipt = validateReceiptShape(rawReceipt) ? rawReceipt : null;
  if (rawCandidate === null) {
    return { protocol_version: 1, candidate: null, watch_receipt: receipt };
  }
  if (!validateReplicaShape(rawCandidate)) {
    return receipt ? { protocol_version: 1, candidate: null, watch_receipt: receipt } : null;
  }
  if (!isSemanticallyValidReplica(pathWriter, rawCandidate, knownState)) {
    return receipt ? { protocol_version: 1, candidate: null, watch_receipt: receipt } : null;
  }
  return {
    protocol_version: 1,
    candidate: rawCandidate,
    watch_receipt: receipt,
  };
}

export function receiptMatchesPendingFinish(
  receipt: WorkoutReceipt,
  pending: WorkoutReplica
): boolean {
  return (
    pending.state.kind === 'finished' &&
    receipt.workout_id === pending.workout_id &&
    receipt.watch_started_at_ms === pending.started_at_ms &&
    receipt.watch_changed_at_ms === pending.changed_at_ms
  );
}
