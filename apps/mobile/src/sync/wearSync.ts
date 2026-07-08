import WearSync from 'wear-sync';

import { getSyncSnapshot, ingestWatchWorkout, WatchWorkoutPayload } from '../db/repositories/sync';

let started = false;

// Subscribes once to the watch's WAL flush and republishes it into the
// phone's SQLite DB via the existing repositories (single writer, so PR
// logic stays sourced from recalcRecordsForExercise).
export function initWearSync(): void {
  if (started) return;
  started = true;
  WearSync.addListener('onWorkoutReceived', async (event) => {
    const payload = JSON.parse(event.payload) as WatchWorkoutPayload;
    await ingestWatchWorkout(payload);
  });
}

// Pushes the current routines/exercises/PR baseline to the watch so it can
// start a workout and detect a PR while offline.
export async function publishSyncSnapshot(): Promise<void> {
  const snapshot = await getSyncSnapshot();
  await WearSync.publishSnapshot(JSON.stringify(snapshot));
}
