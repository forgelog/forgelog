import WearSync from 'wear-sync';

import { mobileStore } from '../db/mobileStore';
import { validateWatchWorkoutPayload } from './watchWorkoutValidator';
import {
  applyRemoteActiveWorkoutMutation,
  getDirtyActiveWorkoutPublications,
  markActiveWorkoutResultPublished,
  markActiveWorkoutStatePublished,
  subscribeActiveWorkoutChanges,
  acknowledgeActiveWorkoutState,
  rejectMalformedActiveWorkoutMutation,
} from '../application/activeWorkoutSync';
import {
  ACTIVE_WORKOUT_PROTOCOL_VERSION,
  assertActiveWorkoutPayloadSize,
  parseActiveWorkoutMutation,
} from './activeWorkoutProtocol';

let started = false;

// Subscribes once to the watch's durable workout outbox and republishes it into the
// phone's SQLite DB via the existing repositories (single writer, so PR
// logic stays sourced from recalcRecordsForExercise). Also subscribes to the
// watch's on-demand "/request-sync" ping and answers it with the same
// publishSyncSnapshot() used on app-open, so the watch isn't stuck waiting
// for the phone to happen to be foregrounded.
export function initWearSync(): void {
  if (started) return;
  started = true;
  WearSync.addListener('onWorkoutReceived', async (event) => {
    let raw: unknown;
    try {
      raw = JSON.parse(event.payload);
    } catch {
      return;
    }
    if (!validateWatchWorkoutPayload(raw)) return;
    if (raw.active_sync) {
      const verification = await mobileStore.sync.verifyActiveWorkoutCheckpoint(raw);
      if (verification === 'acknowledged') await WearSync.ackWorkout(raw.id);
      return;
    }
    await mobileStore.sync.ingestWatchWorkout(raw);
    await WearSync.ackWorkout(raw.id);
  });
  WearSync.addListener('onSyncRequested', () => {
    publishSyncSnapshot();
    runWearBestEffort(publishDirtyActiveWorkout());
  });
  WearSync.addListener('onActiveWorkoutDataChanged', (event) => {
    runWearBestEffort(processActiveWorkoutDataItem(event.path, event.payload));
  });
  runWearBestEffort(drainPersistentDataItems());
  runWearBestEffort(publishDirtyActiveWorkout());
  subscribeActiveWorkoutChanges(() => { runWearBestEffort(publishDirtyActiveWorkout()); });
}

async function processActiveWorkoutDataItem(path: string, payload: string): Promise<void> {
  await handlePersistentDataItem(path, payload);
  await drainPersistentDataItems();
}

function runWearBestEffort(operation: Promise<unknown>): void {
  void operation.catch(() => {
    // Wearable APIs are unavailable on phones without Play Services for Wear.
    // SQLite/outbox state remains dirty and will retry on the next sync trigger.
  });
}

// Pushes the current routines/exercises/PR baseline to the watch so it can
// start a workout and detect a PR while offline. Best-effort: no paired
// watch (or no Wearable API on this device) shouldn't be a fatal error.
export async function publishSyncSnapshot(): Promise<void> {
  const snapshot = await mobileStore.sync.getSnapshot();
  try {
    await WearSync.publishSnapshot(JSON.stringify(snapshot));
  } catch {
    // No reachable watch — nothing to sync to right now.
  }
}

async function drainPersistentDataItems(): Promise<void> {
  const items = await WearSync.enumerateActiveWorkoutDataItems();
  const ordered = [...items].sort((left, right) => activeDataItemOrder(left.path, right.path));
  for (const item of ordered) await handlePersistentDataItem(item.path, item.payload);
}

async function handlePersistentDataItem(path: string, payload: string): Promise<void> {
  if (path.startsWith('/workout/')) {
    let raw: unknown;
    try { raw = JSON.parse(payload); } catch { return; }
    if (!validateWatchWorkoutPayload(raw)) return;
    if (raw.active_sync) {
      const verification = await mobileStore.sync.verifyActiveWorkoutCheckpoint(raw);
      if (verification === 'acknowledged') await WearSync.ackWorkout(raw.id);
      return;
    }
    await mobileStore.sync.ingestWatchWorkout(raw);
    await WearSync.ackWorkout(raw.id);
    return;
  }
  if (path.startsWith('/active-workout/state-ack/')) {
    try {
      const acknowledgement = JSON.parse(payload) as Record<string, unknown>;
      if (
        acknowledgement.protocol_version === ACTIVE_WORKOUT_PROTOCOL_VERSION &&
        typeof acknowledgement.device_id === 'string' &&
        typeof acknowledgement.coordinator_epoch === 'string' &&
        typeof acknowledgement.revision === 'number'
      ) await acknowledgeActiveWorkoutState(acknowledgement as {
        device_id: string; coordinator_epoch: string; revision: number;
      });
    } catch { /* malformed acknowledgements are ignored */ }
    return;
  }
  if (!path.startsWith('/active-workout/mutation/')) return;
  const parts = path.split('/');
  if (parts.length !== 6 || !Number.isInteger(Number(parts[5])) || Number(parts[5]) < 1) return;
  let raw: unknown;
  try {
    assertActiveWorkoutPayloadSize(payload);
    raw = JSON.parse(payload);
  } catch {
    return rejectAndFinalizeMutation(path, parts, payload);
  }
  const mutation = parseActiveWorkoutMutation(raw);
  if (!mutation) return rejectAndFinalizeMutation(path, parts, payload);
  if (
    parts.length !== 6 ||
    parts[3] !== mutation.coordinator_epoch ||
    parts[4] !== mutation.device_id ||
    Number(parts[5]) !== mutation.device_sequence
  ) {
    return rejectAndFinalizeMutation(path, parts, payload);
  }
  const result = await applyRemoteActiveWorkoutMutation(mutation);
  await finalizeMutationOutcome(path, result);
}

async function rejectAndFinalizeMutation(
  path: string,
  parts: string[],
  payload: string
): Promise<void> {
  const result = await rejectMalformedActiveWorkoutMutation({
    coordinatorEpoch: parts[3], deviceId: parts[4], deviceSequence: Number(parts[5]),
  }, payload);
  await finalizeMutationOutcome(path, result);
}

async function finalizeMutationOutcome(
  path: string,
  result: { status: string; reason?: string }
): Promise<void> {
  if (!isWaitingForPredecessor(result)) await WearSync.deleteDataItem(path);
  await publishDirtyActiveWorkout();
}

function isWaitingForPredecessor(result: { status: string; reason?: string }): boolean {
  return result.status === 'blocked_by_predecessor' && result.reason === 'sequence_gap';
}

function activeDataItemOrder(left: string, right: string): number {
  const leftParts = left.split('/');
  const rightParts = right.split('/');
  const leftMutation = left.startsWith('/active-workout/mutation/') && leftParts.length === 6;
  const rightMutation = right.startsWith('/active-workout/mutation/') && rightParts.length === 6;
  if (!leftMutation || !rightMutation) return left.localeCompare(right);
  const streamOrder = `${leftParts[3]}/${leftParts[4]}`.localeCompare(`${rightParts[3]}/${rightParts[4]}`);
  return streamOrder || Number(leftParts[5]) - Number(rightParts[5]);
}

export async function publishDirtyActiveWorkout(): Promise<void> {
  const dirty = await getDirtyActiveWorkoutPublications();
  if (dirty.state) {
    try {
      const json = JSON.stringify(dirty.state);
      assertActiveWorkoutPayloadSize(json);
      await WearSync.publishActiveWorkoutState(json);
      await markActiveWorkoutStatePublished(dirty.state.revision);
    } catch {
      // Preserve the dirty state for retry without blocking independent results.
    }
  }
  for (const result of dirty.results) {
    const json = JSON.stringify(result);
    assertActiveWorkoutPayloadSize(json);
    const path = `/active-workout/result/${result.coordinator_epoch}/${result.device_id}/${result.device_sequence}`;
    await WearSync.publishActiveWorkoutResult(path, json);
    if (result.operation_id) await markActiveWorkoutResultPublished(result.operation_id);
  }
}
