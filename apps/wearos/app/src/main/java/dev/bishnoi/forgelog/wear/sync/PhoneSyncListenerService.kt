package dev.bishnoi.forgelog.wear.sync

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import dev.bishnoi.forgelog.wear.data.AppDatabase
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
                if (event.dataItem.uri.path.orEmpty() != "/sync-snapshot") continue

                val payload = DataMapItem.fromDataItem(event.dataItem).dataMap.getString(PAYLOAD_KEY) ?: continue
                val db = AppDatabase.get(applicationContext)
                scope.launch {
                    val applied = applySyncSnapshotPayload(payload, db)
                    if (!applied) {
                        Log.e(TAG, "Rejected malformed sync snapshot payload: ${payload.take(160)}")
                    }
                }
            }
        } finally {
            dataEvents.release()
        }
    }
}

suspend fun applySyncSnapshotPayload(payload: String, db: AppDatabase): Boolean {
    val snapshot = try {
        syncJson.decodeFromString(SyncSnapshot.serializer(), payload)
    } catch (_: SerializationException) {
        return false
    }
    SyncRepository(db.referenceDao(), db.workoutDao()).applySnapshot(snapshot)
    return true
}
