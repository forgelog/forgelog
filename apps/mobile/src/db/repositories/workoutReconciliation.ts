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

export async function applyWatchWorkoutMailbox(
  db: DatabaseExecutor,
  rawMailbox: unknown,
  nowMs = Date.now()
): Promise<boolean> {
  const known = await listAuthoredWorkoutReplicas(db);
  const mailbox = validateWorkoutMailbox('watch', rawMailbox, known);
  if (!mailbox) return false;

  let receipt = await loadPendingReceipt(db);
  if (
    receipt &&
    (mailbox.candidate !== null || isRawExplicitlyEmpty(rawMailbox)) &&
    !receiptMatchesCandidate(receipt, mailbox.candidate)
  ) {
    receipt = null;
  }

  const desiredBefore = await getDesiredPhoneMailbox(db);
  let transportIntent = desiredBefore.candidate;
  const incomingReplica = mailbox.candidate;
  if (incomingReplica) {
    const incoming: AuthoredWorkoutReplica = { writer: 'watch', replica: incomingReplica };
    const existing = known.find(
      (candidate) => candidate.replica.workout_id === incomingReplica.workout_id
    );
    const resolved = existing
      ? resolveSameWorkout(existing, incoming, 'phone', nowMs)
      : incoming;

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

    if (incomingReplica.state.kind === 'finished' && resolved.replica.state.kind === 'finished') {
      receipt = exactWatchReceipt(incomingReplica);
    }

    if (resolved.writer === 'watch' && transportIntent?.workout_id === incomingReplica.workout_id) {
      transportIntent = null;
    } else if (
      resolved.writer === 'phone' &&
      existing &&
      !canonicalWorkoutContentEqual(resolved, existing) &&
      (transportIntent === null ||
        transportIntent.workout_id === incomingReplica.workout_id ||
        generationIsAtLeast(resolved.replica, transportIntent))
    ) {
      transportIntent = resolved.replica;
    } else if (
      incomingReplica.state.kind === 'active' &&
      transportIntent?.workout_id === incomingReplica.workout_id &&
      transportIntent.state.kind === 'active' &&
      activeBodyDominates(incomingReplica.state.workout, transportIntent.state.workout)
    ) {
      transportIntent = null;
    }
  }

  await storePendingReceipt(db, receipt);
  await setPhoneTransportIntent(db, transportIntent);
  return true;
}

export function mailboxCandidate(mailbox: WorkoutMailbox): WorkoutReplica | null {
  return mailbox.candidate;
}
