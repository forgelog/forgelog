import WearSync from 'wear-sync';

import { mobileStore } from '../db/mobileStore';
import {
  notifyWorkoutMailboxApplied,
  registerWorkoutMailboxPublisher,
} from './workoutMailboxSignal';

let started = false;
let publishRequested = false;
let publishPump: Promise<void> | null = null;

async function applyPeerMailboxPayload(payload: string): Promise<boolean> {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return false;
  }
  const accepted = await mobileStore.sync.applyWatchWorkoutMailbox(raw);
  if (accepted) {
    notifyWorkoutMailboxApplied();
    await publishWorkoutMailbox();
  }
  return accepted;
}

export async function refreshWorkoutMailbox(): Promise<void> {
  let published = false;
  try {
    const peer = await WearSync.getPeerWorkoutMailbox();
    if (peer !== null) published = await applyPeerMailboxPayload(peer);
  } catch {
    // A missing or unreachable watch is normal; the next foreground/live event retries.
  }
  if (!published) await publishWorkoutMailbox();
}

export function initWearSync(): void {
  if (started) return;
  started = true;
  registerWorkoutMailboxPublisher(() => {
    void publishWorkoutMailbox();
  });
  WearSync.addListener('onPeerWorkoutMailbox', (event) =>
    applyPeerMailboxPayload(event.payload).catch(() => false)
  );
  WearSync.addListener('onSyncRequested', () => {
    void publishSyncSnapshot();
  });
  void refreshWorkoutMailbox();
}

export function publishWorkoutMailbox(): Promise<void> {
  publishRequested = true;
  publishPump ??= runPublishPump().finally(() => {
    publishPump = null;
    if (publishRequested) void publishWorkoutMailbox();
  });
  return publishPump;
}

async function runPublishPump(): Promise<void> {
  while (publishRequested) {
    publishRequested = false;
    try {
      const mailbox = await mobileStore.sync.getDesiredWorkoutMailbox();
      await WearSync.publishWorkoutMailbox(JSON.stringify(mailbox));
    } catch {
      // Desired state is durable; startup or a later local/peer event retries it.
    }
  }
}

export async function publishSyncSnapshot(): Promise<void> {
  const snapshot = await mobileStore.sync.getSnapshot();
  try {
    await WearSync.publishSnapshot(JSON.stringify(snapshot));
  } catch {
    // No reachable watch — nothing to sync to right now.
  }
}
