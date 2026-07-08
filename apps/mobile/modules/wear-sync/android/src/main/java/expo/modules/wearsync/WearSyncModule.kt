package expo.modules.wearsync

import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val SNAPSHOT_PATH = "/sync-snapshot"
private const val PAYLOAD_KEY = "payload"
private const val TIMESTAMP_KEY = "timestamp"

class WearSyncModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WearSync")

    Events("onWorkoutReceived")

    OnCreate {
      WearSyncBridge.attach { payload ->
        sendEvent("onWorkoutReceived", mapOf(PAYLOAD_KEY to payload))
      }
    }

    OnDestroy {
      WearSyncBridge.detach()
    }

    // Publishes a JSON SyncSnapshot as a DataItem. DataItems persist on the
    // node and auto-deliver to the watch whenever it next reconnects, which
    // is what satisfies the "gym floors have unreliable signal" constraint.
    AsyncFunction("publishSnapshot") { json: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val request = PutDataMapRequest.create(SNAPSHOT_PATH).apply {
        dataMap.putString(PAYLOAD_KEY, json)
        dataMap.putLong(TIMESTAMP_KEY, System.currentTimeMillis())
      }.asPutDataRequest().setUrgent()
      // AsyncFunction already runs off the JS thread, so a blocking wait here
      // is safe and avoids pulling in kotlinx-coroutines-play-services.
      Tasks.await(Wearable.getDataClient(context).putDataItem(request))
      Unit
    }
  }
}
