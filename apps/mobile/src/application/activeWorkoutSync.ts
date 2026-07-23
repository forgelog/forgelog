import { runInMobileStoreTransaction, type ActiveWorkoutConflict } from '../db/mobileStore';
import type { ActiveWorkoutMutation, ActiveWorkoutResult } from '../sync/activeWorkoutProtocol';
export type { ActiveWorkoutConflict };

type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export async function getActiveWorkoutSyncStatus() {
  return runInMobileStoreTransaction(async (store) => {
    const active = await store.workouts.getActive();
    return store.activeWorkoutSync.ensureCoordinator(active?.id ?? null);
  });
}

export async function applyRemoteActiveWorkoutMutation(
  mutation: ActiveWorkoutMutation
): Promise<ActiveWorkoutResult> {
  const result = await runInMobileStoreTransaction((store) =>
    store.activeWorkoutSync.applyRemoteMutation(mutation)
  );
  if (result.status === 'accepted' && !result.idempotent) notifyActiveWorkoutChanged();
  return result;
}

export async function rejectMalformedActiveWorkoutMutation(
  envelope: { coordinatorEpoch: string; deviceId: string; deviceSequence: number },
  payload: string
) {
  return runInMobileStoreTransaction((store) =>
    store.activeWorkoutSync.rejectMalformedMutation(envelope, payload)
  );
}

export function subscribeActiveWorkoutChanges(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyActiveWorkoutChanged(): void {
  for (const listener of listeners) listener();
}

export async function getDirtyActiveWorkoutPublications() {
  return runInMobileStoreTransaction((store) => store.activeWorkoutSync.listDirtyPublications());
}

export async function markActiveWorkoutStatePublished(revision: number): Promise<void> {
  await runInMobileStoreTransaction((store) =>
    store.activeWorkoutSync.markStatePublished(revision)
  );
}

export async function markActiveWorkoutResultPublished(operationId: string): Promise<void> {
  await runInMobileStoreTransaction((store) =>
    store.activeWorkoutSync.markResultPublished(operationId)
  );
}

export async function getActiveWorkoutConflicts() {
  return runInMobileStoreTransaction((store) => store.activeWorkoutSync.listConflicts());
}

export async function resolveActiveWorkoutConflict(
  operationId: string,
  resolution: 'canonical_kept' | 'operation_reapplied',
  reviewedRevision: number
) {
  const result = await runInMobileStoreTransaction((store) =>
    store.activeWorkoutSync.resolveConflict(operationId, resolution, reviewedRevision)
  );
  notifyActiveWorkoutChanged();
  return result;
}

export async function acknowledgeActiveWorkoutState(input: {
  device_id: string;
  coordinator_epoch: string;
  revision: number;
}): Promise<void> {
  await runInMobileStoreTransaction((store) => store.activeWorkoutSync.acknowledgeWatchState(input));
}
