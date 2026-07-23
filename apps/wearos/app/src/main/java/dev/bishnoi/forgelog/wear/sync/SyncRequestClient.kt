package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val TAG = "SyncRequestClient"
private const val REQUEST_SYNC_PATH = "/request-sync"

/**
 * Sends a one-shot Message (not a DataItem — this is the "is the phone
 * reachable right now" case, unlike the persisted workout/snapshot DataItems in
 * WearDataClient/PhoneSyncListenerService) asking the phone to republish a
 * fresh SyncSnapshot. Best-effort: no connected phone shouldn't crash the
 * watch UI, matching how publishSyncSnapshot() treats "no reachable watch"
 * on the phone side.
 */
object SyncRequestClient {
    // Tasks.await() blocks the calling thread with no timeout, so — unlike
    // WearSyncModule.publishSnapshot on the phone side (already off the JS
    // thread via AsyncFunction) — this must hop off Dispatchers.Main.immediate
    // (RoutineListViewModel.requestSync runs in viewModelScope) or a slow/
    // unreachable phone would ANR the watch UI.
    suspend fun requestSync(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            if (nodes.isEmpty()) {
                Log.i(TAG, "requestSync: no connected phone node")
                return@withContext false
            }
            for (node in nodes) {
                Tasks.await(
                    Wearable.getMessageClient(context)
                        .sendMessage(node.id, REQUEST_SYNC_PATH, ByteArray(0))
                )
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "requestSync failed", e)
            false
        }
    }
}
