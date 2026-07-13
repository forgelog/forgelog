package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SetPerformance
import dev.bishnoi.forgelog.wear.logic.computeRecords
import dev.bishnoi.forgelog.wear.logic.improvedRecords
import dev.bishnoi.forgelog.wear.logic.newId
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The "new PR!" moment, offline: compares the set just marked complete
 * against the PersonalRecordEntity baseline synced from the phone (or
 * already updated locally this session), and persists any improvement so
 * the next set this session compares against the new max too.
 */
class PersonalRecordsTracker(private val referenceDao: ReferenceDao) {
    private val localBaselineIdsByExercise = mutableMapOf<String, MutableMap<RecordType, String>>()
    private val locksByExercise = ConcurrentHashMap<String, Mutex>()

    suspend fun checkAndUpdate(exerciseId: String, set: SetPerformance): List<RecordType> {
        val lock = locksByExercise.computeIfAbsent(exerciseId) { Mutex() }
        return lock.withLock { checkAndUpdateLocked(exerciseId, set) }
    }

    private suspend fun checkAndUpdateLocked(exerciseId: String, set: SetPerformance): List<RecordType> {
        val candidate = computeRecords(listOf(set))
        if (candidate.isEmpty()) return emptyList()

        val baselineEntities = referenceDao.recordsForExercise(exerciseId).associateBy { it.recordType }
        val localBaselineIds = localBaselineIdsByExercise.getOrPut(exerciseId) { mutableMapOf() }
        for ((recordTypeValue, entity) in baselineEntities) {
            val type = RecordType.entries.first { t -> t.value == recordTypeValue }
            if (localBaselineIds[type] != null && localBaselineIds[type] != entity.id) {
                localBaselineIds.remove(type)
            }
        }

        val baseline = baselineEntities.mapKeys { RecordType.entries.first { t -> t.value == it.key } }
            .mapValues { it.value.value }

        val improved = improvedRecords(candidate, baseline).filterNot { localBaselineIds.containsKey(it) }
        val updatesNeeded = candidate.filter { (type, value) ->
            baseline[type]?.let { value > it } ?: true
        }
        if (updatesNeeded.isEmpty()) return improved

        val now = Instant.now().toString()
        val updates = updatesNeeded.map { (type, value) ->
            val existing = baselineEntities[type.value]
            val recordId = existing?.id ?: newId()
            if (existing == null || localBaselineIds.containsKey(type)) {
                localBaselineIds[type] = recordId
            }
            PersonalRecordEntity(
                id = recordId,
                exerciseId = exerciseId,
                recordType = type.value,
                value = value,
                achievedAt = now,
            )
        }
        referenceDao.upsertPersonalRecords(updates)
        return improved
    }
}
