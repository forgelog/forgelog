package dev.bishnoi.forgelog.wear.sync

import dev.bishnoi.forgelog.wear.data.ReferenceRepository

class SyncRepository(private val references: ReferenceRepository) {
    suspend fun applySnapshot(snapshot: SyncSnapshot) {
        references.replaceSnapshot(snapshot)
    }
}
