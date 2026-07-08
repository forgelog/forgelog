package expo.modules.wearsync

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

private const val PAYLOAD_KEY = "payload"

/**
 * Receives the watch's write-ahead-log flush (DataItems under /workout).
 * Only unpacks bytes and hands the JSON payload to [WearSyncBridge] — all
 * parsing/DB writes happen in JS (src/sync/wearSync.ts), so PR logic and
 * schema stay single-sourced in the existing repositories.
 */
class WearSyncListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    try {
      for (event in dataEvents) {
        if (event.type != DataEvent.TYPE_CHANGED) continue
        if (!event.dataItem.uri.path.orEmpty().startsWith("/workout")) continue

        val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
        val payload = dataMap.getString(PAYLOAD_KEY) ?: continue
        WearSyncBridge.deliver(payload)
      }
    } finally {
      dataEvents.release()
    }
  }
}
