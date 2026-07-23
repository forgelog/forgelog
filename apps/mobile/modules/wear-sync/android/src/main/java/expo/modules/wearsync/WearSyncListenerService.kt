package expo.modules.wearsync

import android.util.Log
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

private const val TAG = "WearSyncListenerService"

private const val PAYLOAD_KEY = "payload"
private const val REQUEST_SYNC_PATH = "/request-sync"

/**
 * Receives the watch's durable JSON outbox flush (DataItems under /workout) and
 * on-demand sync requests (Messages at /request-sync). Only unpacks bytes
 * and hands them to [WearSyncBridge] — all parsing/DB writes/snapshot
 * building happen in JS (src/sync/wearSync.ts), so PR logic and schema stay
 * single-sourced in the existing repositories.
 */
class WearSyncListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    try {
      for (event in dataEvents) {
        if (event.type != DataEvent.TYPE_CHANGED) continue
        deliverDataItem(event.dataItem)
      }
    } finally {
      dataEvents.release()
    }
  }

  override fun onMessageReceived(messageEvent: MessageEvent) {
    try {
      deliverMessage(messageEvent.path)
    } catch (e: Exception) {
      // Never let a listener-service callback crash the process — matches
      // the defensive try/finally around onDataChanged above.
      Log.w(TAG, "onMessageReceived failed to deliver /request-sync", e)
    }
  }

  internal companion object {
    fun deliverDataItem(dataItem: DataItem) {
      val path = dataItem.uri.path.orEmpty()
      if (path.startsWith("/active-workout/mutation/") || path.startsWith("/active-workout/state-ack/")) {
        val payload = DataMapItem.fromDataItem(dataItem).dataMap.getString(PAYLOAD_KEY) ?: return
        WearSyncBridge.deliverActive(path, payload)
        return
      }
      if (path != "/workout" && !path.startsWith("/workout/")) return

      val dataMap = DataMapItem.fromDataItem(dataItem).dataMap
      val payload = dataMap.getString(PAYLOAD_KEY) ?: return
      WearSyncBridge.deliver(payload)
    }

    fun deliverMessage(path: String) {
      if (path != REQUEST_SYNC_PATH) return
      WearSyncBridge.deliverSyncRequest()
    }
  }
}
