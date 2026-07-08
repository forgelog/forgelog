import { NativeModule, requireNativeModule } from 'expo-modules-core';

// Payload is an opaque JSON string — the shape lives on the JS side
// (src/db/repositories/sync.ts WatchWorkoutPayload) so this module stays a
// dumb byte-mover between the Data Layer and JS, per the sync design.
export type WorkoutReceivedEvent = { payload: string };

type WearSyncEvents = {
  onWorkoutReceived: (event: WorkoutReceivedEvent) => void;
};

declare class WearSyncModule extends NativeModule<WearSyncEvents> {
  // Publishes a JSON-serialised SyncSnapshot as a Data Layer DataItem so the
  // watch can pick it up now or whenever it next reconnects.
  publishSnapshot(json: string): Promise<void>;
}

export default requireNativeModule<WearSyncModule>('WearSync');
