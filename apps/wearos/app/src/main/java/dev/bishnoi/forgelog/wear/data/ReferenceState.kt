package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.sync.SyncSnapshot
import kotlinx.serialization.Serializable

const val REFERENCE_STATE_FORMAT_VERSION = 1

@Serializable
data class ReferenceState(
    val formatVersion: Int = REFERENCE_STATE_FORMAT_VERSION,
    val snapshot: SyncSnapshot? = null,
    val receivedAtEpochMillis: Long? = null,
)
