package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

private const val ACTIVE_SYNC_TAG = "ActiveWorkoutSync"

object ActiveWorkoutSyncClient {
    suspend fun drainPersistent(context: Context, workouts: WorkoutRepository) = withContext(Dispatchers.IO) {
        val dataClient = Wearable.getDataClient(context)
        val items = Tasks.await(dataClient.dataItems, 30, TimeUnit.SECONDS)
        try {
            for (index in 0 until items.count) {
                val item = items[index]
                val path = item.uri.path.orEmpty()
                if (path != "/active-workout/state" &&
                    !path.startsWith("/active-workout/result/") &&
                    !path.startsWith("/workout-ack/")) continue
                val map = DataMapItem.fromDataItem(item).dataMap
                if (path == "/active-workout/state") {
                    val payload = map.getString("payload") ?: continue
                    applyState(context, workouts, payload)
                } else if (path.startsWith("/active-workout/result/")) {
                    val payload = map.getString("payload") ?: continue
                    if (applyResult(workouts, payload)) {
                        WearDataClient.deleteActiveResult(context, path)
                    }
                } else {
                    val workoutId = map.getString("workout_id") ?: path.substringAfterLast('/')
                    workouts.acknowledgeWorkout(workoutId)
                    WearDataClient.cleanupWorkout(context, workoutId)
                }
            }
        } finally { items.release() }
        WearDataClient.publishPendingMutations(context, workouts)
        workouts.state.first().pendingUploads.forEach { WearDataClient.publishWorkout(context, it.payload) }
    }

    suspend fun applyState(context: Context, workouts: WorkoutRepository, payload: String): Boolean {
        return try {
            assertActiveWorkoutPayloadSize(payload)
            val state = syncJson.decodeFromString(CanonicalActiveWorkoutState.serializer(), payload)
            val applied = workouts.applyCanonicalState(state)
            val local = workouts.state.first()
            val deviceId = local.installationId
            if (applied && deviceId != null) {
                WearDataClient.publishStateAck(context, deviceId, state.coordinatorEpoch, state.revision)
            }
            applied
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.e(ACTIVE_SYNC_TAG, "Could not apply canonical state", error)
            false
        }
    }

    suspend fun applyResult(workouts: WorkoutRepository, payload: String): Boolean {
        return try {
            assertActiveWorkoutPayloadSize(payload)
            workouts.applyOperationResult(syncJson.decodeFromString(ActiveWorkoutResultDto.serializer(), payload))
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.e(ACTIVE_SYNC_TAG, "Could not apply operation result", error)
            false
        }
    }
}
