import WearSync from 'wear-sync';

import { getSyncSnapshot, ingestWatchWorkout, WatchWorkoutPayload } from '../db/repositories/sync';

let started = false;

// Subscribes once to the watch's WAL flush and republishes it into the
// phone's SQLite DB via the existing repositories (single writer, so PR
// logic stays sourced from recalcRecordsForExercise). Also subscribes to the
// watch's on-demand "/request-sync" ping and answers it with the same
// publishSyncSnapshot() used on app-open, so the watch isn't stuck waiting
// for the phone to happen to be foregrounded.
export function initWearSync(): void {
  if (started) return;
  started = true;
  WearSync.addListener('onWorkoutReceived', async (event) => {
    const payload = JSON.parse(event.payload) as WatchWorkoutPayload;
    await ingestWatchWorkout(payload);
  });
  WearSync.addListener('onSyncRequested', () => {
    publishSyncSnapshot();
  });
}

// Pushes the current routines/exercises/PR baseline to the watch so it can
// start a workout and detect a PR while offline. Best-effort: no paired
// watch (or no Wearable API on this device) shouldn't be a fatal error.
export async function publishSyncSnapshot(): Promise<void> {
  const snapshot = await getSyncSnapshot();
  try {
    await WearSync.publishSnapshot(JSON.stringify(snapshot));
  } catch {
    // No reachable watch — nothing to sync to right now.
  }
}
