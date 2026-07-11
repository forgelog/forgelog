package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.serialization.json.Json

private const val PAYLOAD_KEY = "payload"
private const val TIMESTAMP_KEY = "timestamp"

val syncJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * Publishes a WAL entry as a DataItem keyed by workout id. DataItems persist
 * on the node and auto-deliver to the phone whenever it next reconnects —
 * this is what satisfies the "gym floors have unreliable signal" constraint,
 * matching the phone-side WearSyncModule.publishSnapshot counterpart.
 */
object WearDataClient {
    fun publishWorkout(context: Context, payload: WorkoutPayloadDto) {
        val request = PutDataMapRequest.create("/workout/${payload.id}").apply {
            dataMap.putString(PAYLOAD_KEY, syncJson.encodeToString(WorkoutPayloadDto.serializer(), payload))
            dataMap.putLong(TIMESTAMP_KEY, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context).putDataItem(request)
    }
}
