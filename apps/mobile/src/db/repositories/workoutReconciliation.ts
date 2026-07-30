import {
  activeBodyDominates,
  canonicalWorkoutContentEqual,
  resolveSameWorkout,
  type AuthoredWorkoutReplica,
  type WorkoutMailbox,
  type WorkoutReceipt,
  type WorkoutReplica,
} from '../../domain/workoutReplicaSync';
import { validateWorkoutMailbox } from '../../sync/workoutMailboxValidator';
import type { DatabaseExecutor } from '../executor';
import {
  getDesiredPhoneMailbox,
  listAuthoredWorkoutReplicas,
  saveAuthoredWorkoutReplica,
  setPhoneTransportIntent,
  writeFinishedWorkoutTreeInDb,
} from './workoutReplicas';

function exactWatchReceipt(replica: WorkoutReplica): WorkoutReceipt {
  return {
    workout_id: replica.workout_id,
    watch_started_at_ms: replica.started_at_ms,
    watch_changed_at_ms: replica.changed_at_ms,
  };
}

function receiptMatchesCandidate(receipt: WorkoutReceipt, candidate: WorkoutReplica | null): boolean {
  return (
    candidate?.state.kind === 'finished' &&
    receipt.workout_id === candidate.workout_id &&
    receipt.watch_started_at_ms === candidate.started_at_ms &&
    receipt.watch_changed_at_ms === candidate.changed_at_ms
  );
}

function generationIsAtLeast(candidate: WorkoutReplica, current: WorkoutReplica): boolean {
  if (candidate.started_at_ms !== current.started_at_ms) {
    return candidate.started_at_ms > current.started_at_ms;
  }
  return candidate.workout_id.localeCompare(current.workout_id) >= 0;
}

async function loadPendingReceipt(db: DatabaseExecutor): Promise<WorkoutReceipt | null> {
  const row = await db.getFirstAsync<{ pending_watch_receipt_json: string | null }>(
    'SELECT pending_watch_receipt_json FROM workout_mailbox_state WHERE id = 0'
  );
  return row?.pending_watch_receipt_json
    ? (JSON.parse(row.pending_watch_receipt_json) as WorkoutReceipt)
    : null;
}

async function storePendingReceipt(
  db: DatabaseExecutor,
  receipt: WorkoutReceipt | null
): Promise<void> {
  await db.runAsync(
    'UPDATE workout_mailbox_state SET pending_watch_receipt_json = $receipt WHERE id = 0',
    { $receipt: receipt ? JSON.stringify(receipt) : null }
  );
}

function isRawExplicitlyEmpty(mailbox: unknown): boolean {
  return (
    mailbox !== null &&
    typeof mailbox === 'object' &&
    !Array.isArray(mailbox) &&
    (mailbox as Record<string, unknown>).candidate === null
  );
}

function discardStaleReceipt(
  receipt: WorkoutReceipt | null,
  mailbox: WorkoutMailbox,
  rawMailbox: unknown
): WorkoutReceipt | null {
  if (!receipt || (mailbox.candidate === null && !isRawExplicitlyEmpty(rawMailbox))) return receipt;
  return receiptMatchesCandidate(receipt, mailbox.candidate) ? receipt : null;
}

function shouldSendResolvedReplica(
  existing: AuthoredWorkoutReplica | undefined,
  resolved: AuthoredWorkoutReplica,
  incomingReplica: WorkoutReplica,
  transportIntent: WorkoutReplica | null
): boolean {
  return (
    resolved.writer === 'phone' &&
    existing !== undefined &&
    !canonicalWorkoutContentEqual(resolved, existing) &&
    (transportIntent === null ||
      transportIntent.workout_id === incomingReplica.workout_id ||
      generationIsAtLeast(resolved.replica, transportIntent))
  );
}

function incomingActiveDominatesIntent(
  incomingReplica: WorkoutReplica,
  transportIntent: WorkoutReplica | null
): boolean {
  return (
    incomingReplica.state.kind === 'active' &&
    transportIntent?.workout_id === incomingReplica.workout_id &&
    transportIntent.state.kind === 'active' &&
    activeBodyDominates(incomingReplica.state.workout, transportIntent.state.workout)
  );
}

function nextTransportIntent(
  existing: AuthoredWorkoutReplica | undefined,
  resolved: AuthoredWorkoutReplica,
  incomingReplica: WorkoutReplica,
  transportIntent: WorkoutReplica | null
): WorkoutReplica | null {
  if (resolved.writer === 'watch' && transportIntent?.workout_id === incomingReplica.workout_id) {
    return null;
  }
  if (shouldSendResolvedReplica(existing, resolved, incomingReplica, transportIntent)) {
    return resolved.replica;
  }
  return incomingActiveDominatesIntent(incomingReplica, transportIntent) ? null : transportIntent;
}

async function persistResolvedCandidate(
  db: DatabaseExecutor,
  existing: AuthoredWorkoutReplica | undefined,
  resolved: AuthoredWorkoutReplica
): Promise<void> {
  if (!existing || !canonicalWorkoutContentEqual(existing, resolved)) {
    await saveAuthoredWorkoutReplica(db, resolved);
  }
  if (resolved.replica.state.kind === 'finished') {
    await writeFinishedWorkoutTreeInDb(
      db,
      resolved.replica,
      resolved.replica.state.workout,
      resolved.replica.state.ended_at_ms
    );
  }
}

async function reconcileCandidate(
  db: DatabaseExecutor,
  known: readonly AuthoredWorkoutReplica[],
  incomingReplica: WorkoutReplica,
  transportIntent: WorkoutReplica | null,
  receipt: WorkoutReceipt | null,
  nowMs: number
): Promise<{ transportIntent: WorkoutReplica | null; receipt: WorkoutReceipt | null }> {
  const incoming: AuthoredWorkoutReplica = { writer: 'watch', replica: incomingReplica };
  const existing = known.find(
    (candidate) => candidate.replica.workout_id === incomingReplica.workout_id
  );
  const resolved = existing ? resolveSameWorkout(existing, incoming, 'phone', nowMs) : incoming;
  await persistResolvedCandidate(db, existing, resolved);

  const nextReceipt =
    incomingReplica.state.kind === 'finished' && resolved.replica.state.kind === 'finished'
      ? exactWatchReceipt(incomingReplica)
      : receipt;
  return {
    receipt: nextReceipt,
    transportIntent: nextTransportIntent(existing, resolved, incomingReplica, transportIntent),
  };
}

export async function applyWatchWorkoutMailbox(
  db: DatabaseExecutor,
  rawMailbox: unknown,
  nowMs = Date.now()
): Promise<boolean> {
  const known = await listAuthoredWorkoutReplicas(db);
  const mailbox = validateWorkoutMailbox('watch', rawMailbox, known);
  if (!mailbox) return false;

  let receipt = discardStaleReceipt(await loadPendingReceipt(db), mailbox, rawMailbox);

  const desiredBefore = await getDesiredPhoneMailbox(db);
  let transportIntent = desiredBefore.candidate;
  const incomingReplica = mailbox.candidate;
  if (incomingReplica) {
    const reconciled = await reconcileCandidate(
      db,
      known,
      incomingReplica,
      transportIntent,
      receipt,
      nowMs
    );
    receipt = reconciled.receipt;
    transportIntent = reconciled.transportIntent;
  }

  await storePendingReceipt(db, receipt);
  await setPhoneTransportIntent(db, transportIntent);
  return true;
}

export function mailboxCandidate(mailbox: WorkoutMailbox): WorkoutReplica | null {
  return mailbox.candidate;
}
