package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.flow.first

private const val PAYLOAD_KEY = "payload"
private const val TIMESTAMP_KEY = "timestamp"
private const val PUBLISH_TIMEOUT_SECONDS = 30L

val syncJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * Publishes a JSON outbox entry as a DataItem keyed by workout id. DataItems persist
 * on the node and auto-deliver to the phone whenever it next reconnects —
 * this is what satisfies the "gym floors have unreliable signal" constraint,
 * matching the phone-side WearSyncModule.publishSnapshot counterpart.
 */
object WearDataClient {
    suspend fun publishActiveMutation(context: Context, mutation: ActiveWorkoutMutationDto) {
        val json = syncJson.encodeToString(ActiveWorkoutMutationDto.serializer(), mutation)
        assertActiveWorkoutPayloadSize(json)
        publishJson(context, "/active-workout/mutation/${mutation.coordinatorEpoch}/${mutation.deviceId}/${mutation.deviceSequence}", json)
    }

    suspend fun publishStateAck(context: Context, deviceId: String, epoch: String, revision: Long) {
        val json = """{"protocol_version":1,"device_id":"$deviceId","coordinator_epoch":"$epoch","revision":$revision}"""
        publishJson(context, "/active-workout/state-ack/$deviceId", json)
    }

    private suspend fun publishJson(context: Context, path: String, json: String) {
        val request = PutDataMapRequest.create(path).apply {
            dataMap.putString(PAYLOAD_KEY, json)
            dataMap.putLong(TIMESTAMP_KEY, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        withContext(Dispatchers.IO) {
            Tasks.await(Wearable.getDataClient(context).putDataItem(request), PUBLISH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        }
    }

    suspend fun publishPendingMutations(context: Context, workouts: WorkoutRepository) {
        workouts.state.first().pendingMutations.forEach { publishActiveMutation(context, it) }
    }

    suspend fun publishWorkout(context: Context, payload: WorkoutPayloadDto) {
        val request = PutDataMapRequest.create("/workout/${payload.id}").apply {
            dataMap.putString(PAYLOAD_KEY, syncJson.encodeToString(WorkoutPayloadDto.serializer(), payload))
            dataMap.putLong(TIMESTAMP_KEY, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        withContext(Dispatchers.IO) {
            Tasks.await(
                Wearable.getDataClient(context).putDataItem(request),
                PUBLISH_TIMEOUT_SECONDS,
                TimeUnit.SECONDS,
            )
        }
    }

    suspend fun cleanupWorkout(context: Context, workoutId: String) = withContext(Dispatchers.IO) {
        val dataClient = Wearable.getDataClient(context)
        val paths = setOf("/workout/$workoutId", "/workout-ack/$workoutId")
        val items = Tasks.await(
            dataClient.dataItems,
            PUBLISH_TIMEOUT_SECONDS,
            TimeUnit.SECONDS,
        )
        val uris = try {
            (0 until items.count).map { items[it].uri }.filter { it.path in paths }
        } finally {
            items.release()
        }
        uris.forEach { uri ->
            Tasks.await(
                dataClient.deleteDataItems(uri, DataClient.FILTER_LITERAL),
                PUBLISH_TIMEOUT_SECONDS,
                TimeUnit.SECONDS,
            )
        }
    }

    suspend fun deleteActiveResult(context: Context, path: String) = withContext(Dispatchers.IO) {
        require(path.startsWith("/active-workout/result/")) { "invalid active workout result path" }
        val dataClient = Wearable.getDataClient(context)
        val items = Tasks.await(dataClient.dataItems, PUBLISH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        val uris = try {
            (0 until items.count).map { items[it].uri }.filter { it.path == path }
        } finally {
            items.release()
        }
        uris.forEach { uri ->
            Tasks.await(
                dataClient.deleteDataItems(uri, DataClient.FILTER_LITERAL),
                PUBLISH_TIMEOUT_SECONDS,
                TimeUnit.SECONDS,
            )
        }
    }
}
