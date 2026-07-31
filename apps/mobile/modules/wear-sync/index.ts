import { NativeModule, requireNativeModule } from 'expo-modules-core';

// Payload is opaque JSON so this module remains a byte-mover between the
// Data Layer and the JavaScript mailbox reducer.
export type PeerWorkoutMailboxEvent = { payload: string };

type WearSyncEvents = {
  onPeerWorkoutMailbox: (event: PeerWorkoutMailboxEvent) => void;
  // Fired when the watch pings /request-sync asking for a fresh snapshot.
  onSyncRequested: () => void;
};

declare class WearSyncModule extends NativeModule<WearSyncEvents> {
  // Publishes a JSON-serialised SyncSnapshot as a Data Layer DataItem so the
  // watch can pick it up now or whenever it next reconnects.
  publishSnapshot(json: string): Promise<void>;
  publishWorkoutMailbox(json: string): Promise<void>;
  getPeerWorkoutMailbox(): Promise<string | null>;
}

export default requireNativeModule<WearSyncModule>('WearSync');
