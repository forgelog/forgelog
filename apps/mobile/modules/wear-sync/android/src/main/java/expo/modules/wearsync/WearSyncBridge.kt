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
}
