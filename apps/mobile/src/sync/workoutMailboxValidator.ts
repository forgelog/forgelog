import Ajv from 'ajv';

import {
  canonicalWorkoutContentEqual,
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
  const keys = Object.keys(value).sort();
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

function entriesDoNotReuseVersion(
  incoming: ActiveWorkoutBody,
  known: ActiveWorkoutBody
): boolean {
  for (const key of Object.keys(incoming.fields) as (keyof ActiveWorkoutBody['fields'])[]) {
    const incomingField = incoming.fields[key];
    const knownField = known.fields[key];
    if (
      versionsEqual(incomingField.version, knownField.version) &&
      !canonicalWorkoutContentEqual(incomingField, knownField)
    ) {
      return false;
    }
  }

  const knownExercises = new Map(known.exercises.map((exercise) => [exercise.id, exercise]));
  const knownSetParents = new Map<string, string>();
  for (const exercise of known.exercises) {
    for (const set of exercise.sets) knownSetParents.set(set.id, exercise.id);
  }
  for (const exercise of incoming.exercises) {
    const knownExercise = knownExercises.get(exercise.id);
    if (knownExercise && versionsEqual(exercise.version, knownExercise.version)) {
      const incomingEntry = { ...exercise, sets: undefined };
      const knownEntry = { ...knownExercise, sets: undefined };
      if (!canonicalWorkoutContentEqual(incomingEntry, knownEntry)) return false;
    }
    const knownSets = new Map(knownExercise?.sets.map((set) => [set.id, set]) ?? []);
    for (const set of exercise.sets) {
      const knownParent = knownSetParents.get(set.id);
      if (knownParent !== undefined && knownParent !== exercise.id) return false;
      const knownSet = knownSets.get(set.id);
      if (
        knownSet &&
        versionsEqual(set.version, knownSet.version) &&
        !canonicalWorkoutContentEqual(set, knownSet)
      ) {
        return false;
      }
    }
  }
  return true;
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

  for (const known of knownState) {
    if (known.replica.workout_id !== replica.workout_id) continue;
    if (known.replica.started_at_ms !== replica.started_at_ms) return false;
    if (
      known.writer === pathWriter &&
      known.replica.changed_at_ms === replica.changed_at_ms &&
      !canonicalWorkoutContentEqual(known.replica, replica)
    ) {
      return false;
    }
    if (known.replica.state.kind === 'active' && replica.state.kind === 'active') {
      if (!entriesDoNotReuseVersion(replica.state.workout, known.replica.state.workout)) return false;
    }
  }
  return true;
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
  if (rawCandidate !== null && rawCandidate !== undefined && !validateReplicaShape(rawCandidate)) {
    return {
      protocol_version: 1,
      candidate: null,
      watch_receipt: validateReceiptShape(rawReceipt) ? rawReceipt : null,
    };
  }
  const candidate = validateReplicaShape(rawCandidate) ? rawCandidate : null;
  const receipt = validateReceiptShape(rawReceipt) ? rawReceipt : null;
  return {
    protocol_version: 1,
    candidate:
      candidate && isSemanticallyValidReplica(pathWriter, candidate, knownState) ? candidate : null,
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
