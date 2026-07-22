import WearSync from 'wear-sync';

import { mobileStore } from '../db/mobileStore';
import { validateWatchWorkoutPayload } from './watchWorkoutValidator';

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
    await mobileStore.sync.ingestWatchWorkout(raw);
    await WearSync.ackWorkout(raw.id);
  });
  WearSync.addListener('onSyncRequested', () => {
    publishSyncSnapshot();
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
