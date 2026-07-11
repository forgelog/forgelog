package dev.bishnoi.forgelog.wear.logic

data class SetPerformance(val weight: Double?, val reps: Int?)

enum class RecordType(val value: String) {
    MAX_WEIGHT("max_weight"),
    MAX_REPS("max_reps"),
    MAX_VOLUME("max_volume"),
    EST_1RM("est_1rm"),
}

/**
 * Epley estimated 1RM: weight * (1 + reps / 30). Mirrors
 * apps/mobile/src/domain/records.ts estimatedOneRepMax exactly.
 */
fun estimatedOneRepMax(weight: Double, reps: Int): Double = weight * (1 + reps / 30.0)

/**
 * Ports apps/mobile/src/domain/records.ts computeRecords: only produces record
 * types that have data, so reps-only exercises never get a weight-based PR.
 */
/**
 * The watch doesn't have the phone's full logged_sets history, only the
 * synced PersonalRecordEntity baseline — so instead of recomputing over all
 * sets (like apps/mobile/src/db/repositories/personalRecords.ts does), a
 * single just-completed set's candidate values are compared directly against
 * that baseline. A record type with no baseline (never seen before) always
 * counts as improved, matching the phone's `prev === undefined` case.
 */
fun improvedRecords(
    candidate: Map<RecordType, Double>,
    baseline: Map<RecordType, Double>,
): List<RecordType> =
    candidate.filter { (type, value) -> value > (baseline[type] ?: Double.NEGATIVE_INFINITY) }.keys.toList()

fun computeRecords(sets: List<SetPerformance>): Map<RecordType, Double> {
    val records = mutableMapOf<RecordType, Double>()
    for (set in sets) {
        val weight = set.weight
        val reps = set.reps
        if (weight != null) {
            records[RecordType.MAX_WEIGHT] = maxOf(records[RecordType.MAX_WEIGHT] ?: 0.0, weight)
        }
        if (reps != null) {
            records[RecordType.MAX_REPS] = maxOf(records[RecordType.MAX_REPS] ?: 0.0, reps.toDouble())
        }
        if (weight != null && reps != null) {
            records[RecordType.MAX_VOLUME] = maxOf(records[RecordType.MAX_VOLUME] ?: 0.0, weight * reps)
            records[RecordType.EST_1RM] =
                maxOf(records[RecordType.EST_1RM] ?: 0.0, estimatedOneRepMax(weight, reps))
        }
    }
    return records
}
