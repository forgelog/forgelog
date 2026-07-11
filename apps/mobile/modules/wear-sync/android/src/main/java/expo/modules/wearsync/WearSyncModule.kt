package expo.modules.wearsync

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

private const val SNAPSHOT_PATH = "/sync-snapshot"
private const val PAYLOAD_KEY = "payload"
private const val TIMESTAMP_KEY = "timestamp"

class WearSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearSync")

    Events("onWorkoutReceived", "onSyncRequested")

    OnCreate {
      WearSyncBridge.attach { payload ->
        sendEvent("onWorkoutReceived", mapOf(PAYLOAD_KEY to payload))
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
  }
}
