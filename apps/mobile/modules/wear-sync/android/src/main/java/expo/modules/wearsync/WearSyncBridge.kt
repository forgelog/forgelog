package expo.modules.wearsync

/**
 * The [WearSyncListenerService] is started by Play Services on demand and may
 * run before any JS context exists. This singleton decouples it from the
 * [WearSyncModule] instance: payloads that arrive with nothing attached are
 * queued and flushed to the module once JS attaches (app foregrounded).
 */
internal object WearSyncBridge {
  private val pending = mutableListOf<String>()
  private var listener: ((String) -> Unit)? = null

  // The watch's "/request-sync" message doesn't carry a payload — it's just a
  // ping — so this channel only needs a pending flag (deduped: several pings
  // before JS attaches still only trigger one publish), delivered once JS
  // attaches (mirrors the workout-payload queue above).
  private var syncRequestPending = false
  private var syncRequestListener: (() -> Unit)? = null

  @Synchronized
  fun attach(onWorkoutReceived: (String) -> Unit) {
    listener = onWorkoutReceived
    val queued = pending.toList()
    pending.clear()
    queued.forEach(onWorkoutReceived)
  }

  @Synchronized
  fun detach() {
    listener = null
  }

  @Synchronized
  fun deliver(payload: String) {
    val current = listener
    if (current != null) {
      current(payload)
    } else {
      pending.add(payload)
    }
  }

  @Synchronized
  fun attachSyncRequestListener(onSyncRequested: () -> Unit) {
    syncRequestListener = onSyncRequested
    if (syncRequestPending) {
      syncRequestPending = false
      onSyncRequested()
    }
  }

  @Synchronized
  fun detachSyncRequestListener() {
    syncRequestListener = null
  }

  @Synchronized
  fun deliverSyncRequest() {
    val current = syncRequestListener
    if (current != null) {
      current()
    } else {
      syncRequestPending = true
    }
  }
}
