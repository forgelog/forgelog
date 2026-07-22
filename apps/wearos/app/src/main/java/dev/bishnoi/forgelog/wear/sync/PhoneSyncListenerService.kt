package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.ReferenceRepository
import dev.bishnoi.forgelog.wear.data.WearStoreProvider
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

private const val PAYLOAD_KEY = "payload"
private const val WORKOUT_ID_KEY = "workout_id"
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
                            val applied = applySyncSnapshotPayload(payload, stores.references)
                            if (!applied) {
                                Log.e(TAG, "Rejected malformed sync snapshot payload")
                            } else {
                                drainPending(applicationContext, stores.workouts)
                            }
                        }
                    }
                    path.startsWith("/workout-ack/") -> {
                        val workoutId = dataMap.getString(WORKOUT_ID_KEY) ?: path.substringAfterLast('/')
                        if (workoutId.isBlank()) continue
                        scope.launch {
                            stores.workouts.acknowledgeWorkout(workoutId)
                            runCatching { WearDataClient.cleanupWorkout(applicationContext, workoutId) }
                                .onFailure { Log.w(TAG, "Could not clean up acknowledged workout $workoutId", it) }
                            drainPending(applicationContext, stores.workouts)
                        }
                    }
                }
            }
        } finally {
            dataEvents.release()
        }
    }
}

private suspend fun drainPending(
    context: Context,
    workouts: WorkoutRepository,
) {
    FinishWorkout(workouts, publish = { payload ->
        WearDataClient.publishWorkout(context, payload)
    }).drainPending()
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
