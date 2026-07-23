package expo.modules.wearsync

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

private const val SNAPSHOT_PATH = "/sync-snapshot"
private const val WORKOUT_ACK_PATH = "/workout-ack"
private const val PAYLOAD_KEY = "payload"
private const val WORKOUT_ID_KEY = "workout_id"
private const val TIMESTAMP_KEY = "timestamp"

class WearSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearSync")

    Events("onWorkoutReceived", "onSyncRequested", "onActiveWorkoutDataChanged")

    OnCreate {
      WearSyncBridge.attach { payload ->
        sendEvent("onWorkoutReceived", mapOf(PAYLOAD_KEY to payload))
      }
      WearSyncBridge.attachSyncRequestListener {
        sendEvent("onSyncRequested", mapOf())
      }
      WearSyncBridge.attachActiveListener { item ->
        sendEvent("onActiveWorkoutDataChanged", mapOf("path" to item.path, PAYLOAD_KEY to item.payload))
      }
    }

    OnDestroy {
      WearSyncBridge.detach()
      WearSyncBridge.detachSyncRequestListener()
      WearSyncBridge.detachActiveListener()
    }

    // Publishes a JSON SyncSnapshot as a DataItem. DataItems persist on the
    // node and auto-deliver to the watch whenever it next reconnects, which
    // is what satisfies the "gym floors have unreliable signal" constraint.
    AsyncFunction("publishSnapshot") { json: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishSnapshot(context, json)
      Unit
    }

    AsyncFunction("ackWorkout") { workoutId: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishWorkoutAck(context, workoutId)
      Unit
    }

    AsyncFunction("publishActiveWorkoutState") { json: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishJson(context, "/active-workout/state", json)
      Unit
    }

    AsyncFunction("publishActiveWorkoutResult") { path: String, json: String ->
      require(path.startsWith("/active-workout/result/")) { "invalid active workout result path" }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishJson(context, path, json)
      Unit
    }

    AsyncFunction("enumerateActiveWorkoutDataItems") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      enumerateActiveItems(context)
    }

    AsyncFunction("deleteDataItem") { path: String ->
      require(path.startsWith("/active-workout/")) { "invalid active workout path" }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      deletePath(context, path)
      Unit
    }
  }

  internal companion object {
    fun buildSnapshotRequest(
      json: String,
      timestamp: Long = System.currentTimeMillis(),
    ): PutDataRequest =
      PutDataMapRequest.create(SNAPSHOT_PATH).apply {
        dataMap.putString(PAYLOAD_KEY, json)
        dataMap.putLong(TIMESTAMP_KEY, timestamp)
      }.asPutDataRequest().setUrgent()

    fun publishSnapshot(context: Context, json: String) {
      val request = buildSnapshotRequest(json)
      // AsyncFunction already runs off the JS thread, so a blocking wait here
      // is safe and avoids pulling in kotlinx-coroutines-play-services.
      Tasks.await(Wearable.getDataClient(context).putDataItem(request), 30, TimeUnit.SECONDS)
    }

    fun buildWorkoutAckRequest(
      workoutId: String,
      timestamp: Long = System.currentTimeMillis(),
    ): PutDataRequest {
      require(workoutId.isNotBlank()) { "workoutId must not be blank" }
      return PutDataMapRequest.create("$WORKOUT_ACK_PATH/$workoutId").apply {
        dataMap.putString(WORKOUT_ID_KEY, workoutId)
        dataMap.putLong(TIMESTAMP_KEY, timestamp)
      }.asPutDataRequest().setUrgent()
    }

    fun publishWorkoutAck(context: Context, workoutId: String) {
      val request = buildWorkoutAckRequest(workoutId)
      Tasks.await(Wearable.getDataClient(context).putDataItem(request), 30, TimeUnit.SECONDS)
    }

    fun buildJsonRequest(path: String, json: String, timestamp: Long = System.currentTimeMillis()): PutDataRequest {
      require(json.toByteArray(Charsets.UTF_8).size <= 90_000) { "active_workout_payload_too_large" }
      return PutDataMapRequest.create(path).apply {
        dataMap.putString(PAYLOAD_KEY, json)
        dataMap.putLong(TIMESTAMP_KEY, timestamp)
      }.asPutDataRequest().setUrgent()
    }

    fun publishJson(context: Context, path: String, json: String) {
      Tasks.await(Wearable.getDataClient(context).putDataItem(buildJsonRequest(path, json)), 30, TimeUnit.SECONDS)
    }

    fun enumerateActiveItems(context: Context): List<Map<String, String>> {
      val items = Tasks.await(Wearable.getDataClient(context).dataItems, 30, TimeUnit.SECONDS)
      return try {
        (0 until items.count).mapNotNull { index ->
          val item = items[index]
          val path = item.uri.path.orEmpty()
          if (!path.startsWith("/active-workout/mutation/") &&
              !path.startsWith("/active-workout/state-ack/") &&
              !path.startsWith("/workout/")) return@mapNotNull null
          val payload = DataMapItem.fromDataItem(item).dataMap.getString(PAYLOAD_KEY) ?: return@mapNotNull null
          mapOf("path" to path, PAYLOAD_KEY to payload)
        }
      } finally { items.release() }
    }

    fun deletePath(context: Context, path: String) {
      val items = Tasks.await(Wearable.getDataClient(context).dataItems, 30, TimeUnit.SECONDS)
      val uris = try { (0 until items.count).map { items[it].uri }.filter { it.path == path } }
      finally { items.release() }
      uris.forEach { Tasks.await(Wearable.getDataClient(context).deleteDataItems(it, DataClient.FILTER_LITERAL), 30, TimeUnit.SECONDS) }
    }
  }
}
