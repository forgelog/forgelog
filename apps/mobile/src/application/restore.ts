import type { InstallationMarker } from '../backup/installationMarker';
import {
  runInMobileStoreTransaction,
  type RestoreSource,
  type TransactionBoundMobileStore,
} from '../db/mobileStore';
import { classifyLaunch, type LaunchKind } from '../domain/restoreDetection';
import { signalWorkoutMailboxPublisher } from '../sync/workoutMailboxSignal';

/**
 * Detects a database restored by Android Auto Backup or device transfer and
 * finishes the restore. Must run before wear sync starts so the watch sees the
 * post-restore state.
 *
 * The marker is created before the database is updated: a crash between the
 * two leaves a mismatch that the next launch resolves the same way.
 */
export async function checkForOsRestore(
  marker: InstallationMarker,
  now: () => Date = () => new Date()
): Promise<LaunchKind> {
  const installationId = await marker.readOrCreate();
  const kind = await runInMobileStoreTransaction(async (store) => {
    const state = await store.backupState.get();
    const launch = classifyLaunch(installationId, state.installation_id);
    if (launch === 'restored') await completeRestore(store, 'os', now());
    if (launch !== 'normal') await store.backupState.saveInstallationId(installationId);
    return launch;
  });
  if (kind === 'restored') signalWorkoutMailboxPublisher();
  return kind;
}

/**
 * Shared post-restore step for every restore source. A restored in-progress
 * workout is stale, so it is discarded through the normal lifecycle: the watch
 * still keeps its own finished copy because finished outranks discarded.
 */
async function completeRestore(
  store: TransactionBoundMobileStore,
  source: RestoreSource,
  restoredAt: Date
): Promise<void> {
  const active = await store.workoutReplicas.getActive();
  if (active) await store.workoutReplicas.discard(active.id, restoredAt.getTime());
  await store.backupState.recordRestore({
    source,
    restoredAt: restoredAt.toISOString(),
    notice: active ? 'active_workout_discarded' : null,
  });
}
