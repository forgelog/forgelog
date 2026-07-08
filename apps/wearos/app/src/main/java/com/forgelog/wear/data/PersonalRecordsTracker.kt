package com.forgelog.wear.data

import com.forgelog.wear.logic.RecordType
import com.forgelog.wear.logic.SetPerformance
import com.forgelog.wear.logic.computeRecords
import com.forgelog.wear.logic.improvedRecords
import com.forgelog.wear.logic.newId
import java.time.Instant

/**
 * The "new PR!" moment, offline: compares the set just marked complete
 * against the PersonalRecordEntity baseline synced from the phone (or
 * already updated locally this session), and persists any improvement so
 * the next set this session compares against the new max too.
 */
class PersonalRecordsTracker(private val referenceDao: ReferenceDao) {
    suspend fun checkAndUpdate(exerciseId: String, set: SetPerformance): List<RecordType> {
        val candidate = computeRecords(listOf(set))
        if (candidate.isEmpty()) return emptyList()

        val baselineEntities = referenceDao.recordsForExercise(exerciseId).associateBy { it.recordType }
        val baseline = baselineEntities.mapKeys { RecordType.entries.first { t -> t.value == it.key } }
            .mapValues { it.value.value }

        val improved = improvedRecords(candidate, baseline)
        if (improved.isEmpty()) return improved

        val now = Instant.now().toString()
        val updates = improved.map { type ->
            val existing = baselineEntities[type.value]
            PersonalRecordEntity(
                id = existing?.id ?: newId(),
                exerciseId = exerciseId,
                recordType = type.value,
                value = candidate.getValue(type),
                achievedAt = now,
            )
        }
        referenceDao.upsertPersonalRecords(updates)
        return improved
    }
}
