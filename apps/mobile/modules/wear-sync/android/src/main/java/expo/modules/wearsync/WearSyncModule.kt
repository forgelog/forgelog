package expo.modules.wearsync

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

private const val SNAPSHOT_PATH = "/sync-snapshot"
private const val PHONE_WORKOUT_MAILBOX_PATH = "/workout-mailbox/phone"
private const val WATCH_WORKOUT_MAILBOX_PATH = "/workout-mailbox/watch"
private const val PAYLOAD_KEY = "payload"
private const val TIMESTAMP_KEY = "timestamp"

class WearSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearSync")

    Events("onPeerWorkoutMailbox", "onSyncRequested")

    OnCreate {
      WearSyncBridge.attach { payload ->
        sendEvent("onPeerWorkoutMailbox", mapOf(PAYLOAD_KEY to payload))
      }
      WearSyncBridge.attachSyncRequestListener {
        sendEvent("onSyncRequested", mapOf())
      }
    }

    OnDestroy {
      WearSyncBridge.detach()
      WearSyncBridge.detachSyncRequestListener()
    }

    // Publishes a JSON SyncSnapshot as a DataItem. DataItems persist on the
    // node and auto-deliver to the watch whenever it next reconnects, which
    // is what satisfies the "gym floors have unreliable signal" constraint.
    AsyncFunction("publishSnapshot") { json: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishSnapshot(context, json)
      Unit
    }

    AsyncFunction("publishWorkoutMailbox") { json: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      publishWorkoutMailbox(context, json)
      Unit
    }

    AsyncFunction("getPeerWorkoutMailbox") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      getPeerWorkoutMailbox(context)
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

    fun buildWorkoutMailboxRequest(json: String): PutDataRequest =
      PutDataMapRequest.create(PHONE_WORKOUT_MAILBOX_PATH).apply {
        dataMap.putString(PAYLOAD_KEY, json)
      }.asPutDataRequest().setUrgent()

    fun publishWorkoutMailbox(context: Context, json: String) {
      val request = buildWorkoutMailboxRequest(json)
      Tasks.await(Wearable.getDataClient(context).putDataItem(request), 30, TimeUnit.SECONDS)
    }

    fun getPeerWorkoutMailbox(context: Context): String? {
      val items = Tasks.await(Wearable.getDataClient(context).dataItems, 30, TimeUnit.SECONDS)
      return try {
        (0 until items.count)
          .asSequence()
          .map { items[it] }
          .firstOrNull { it.uri.path == WATCH_WORKOUT_MAILBOX_PATH }
          ?.let { com.google.android.gms.wearable.DataMapItem.fromDataItem(it).dataMap.getString(PAYLOAD_KEY) }
      } finally {
        items.release()
      }
    }
  }
}
