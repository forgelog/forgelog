package dev.bishnoi.forgelog.wear.sync

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import dev.bishnoi.forgelog.wear.data.ReferenceRepository
import dev.bishnoi.forgelog.wear.data.WearStoreProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

private const val PAYLOAD_KEY = "payload"
private const val TAG = "PhoneSyncListener"

/**
 * Receives the phone's SyncSnapshot (routines/exercises/PR baseline) so the
 * watch can start a workout and detect a PR offline. Mirrors the phone's
 * WearSyncListenerService: only unpacks bytes here, all writes go through
 * SyncRepository.
 */
class PhoneSyncListenerService : WearableListenerService() {
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        try {
            for (event in dataEvents) {
                if (event.type != DataEvent.TYPE_CHANGED) continue
                val path = event.dataItem.uri.path.orEmpty()
                val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
                val stores = WearStoreProvider.get(applicationContext)
                when {
                    path == "/sync-snapshot" -> {
                        val payload = dataMap.getString(PAYLOAD_KEY) ?: continue
                        scope.launch {
                            handleListenerFailure("Could not apply sync snapshot") {
                                val applied = applySyncSnapshotPayload(payload, stores.references)
                                if (!applied) {
                                    Log.e(TAG, "Rejected malformed sync snapshot payload")
                                } else {
                                    stores.workoutMailboxSync.requestPublish()
                                }
                            }
                        }
                    }
                    path == "/workout-mailbox/phone" -> {
                        val payload = dataMap.getString(PAYLOAD_KEY) ?: continue
                        scope.launch {
                            handleListenerFailure("Could not apply workout mailbox") {
                                val applied = stores.workoutMailboxSync.applyPeerPayload(payload)
                                if (!applied) Log.e(TAG, "Rejected malformed workout mailbox payload")
                            }
                        }
                    }
                }
            }
        } finally {
            dataEvents.release()
        }
    }
}

private suspend fun handleListenerFailure(
    message: String,
    operation: suspend () -> Unit,
) {
    try {
        operation()
    } catch (error: Exception) {
        error.rethrowIfCancellation()
        Log.e(TAG, message, error)
    }
}

private fun Exception.rethrowIfCancellation() {
    if (this is CancellationException) throw this
}

suspend fun applySyncSnapshotPayload(payload: String, references: ReferenceRepository): Boolean {
    val snapshot = try {
        syncJson.decodeFromString(SyncSnapshot.serializer(), payload)
    } catch (_: SerializationException) {
        return false
    }
    if (snapshot.protocolVersion != SYNC_PROTOCOL_VERSION) return false
    return try {
        SyncRepository(references).applySnapshot(snapshot)
        true
    } catch (_: IllegalArgumentException) {
        false
    }
}
