package dev.bishnoi.forgelog.wear.logic

data class SetPerformance(
    val weight: Double?,
    val reps: Int?,
    val exerciseType: ExerciseType = ExerciseType.WEIGHT_REPS,
    val setType: String = "normal",
)

enum class RecordType(val value: String) {
    MAX_WEIGHT("max_weight"),
    MAX_REPS("max_reps"),
    MAX_VOLUME("max_volume"),
    EST_1RM("est_1rm"),
}

private val oneRepMaxPercentages = mapOf(
    1 to 1.0,
    2 to 0.95,
    3 to 0.93,
    4 to 0.90,
    5 to 0.87,
    6 to 0.86,
    7 to 0.83,
    8 to 0.81,
    9 to 0.78,
    10 to 0.75,
    11 to 0.73,
    12 to 0.71,
    13 to 0.70,
    14 to 0.68,
    15 to 0.67,
)

fun estimatedOneRepMax(weight: Double, reps: Int): Double? =
    oneRepMaxPercentages[reps]?.let { percentage -> weight / percentage }

/**
 * Ports apps/mobile/src/domain/records.ts computeRecords: only produces record
 * types that have data, so reps-only exercises never get a weight-based PR.
 */
/**
 * The watch doesn't have the phone's full logged_sets history, only the
 * synced PersonalRecordEntity baseline — so instead of recomputing over all
 * sets (like apps/mobile/src/db/repositories/personalRecords.ts does), a
 * single just-completed set's candidate values are compared directly against
 * that baseline. A record type with no synced baseline is a silent local
 * baseline on the watch, matching the phone's first-occurrence behavior.
 */
fun improvedRecords(
    candidate: Map<RecordType, Double>,
    baseline: Map<RecordType, Double>,
): List<RecordType> =
    candidate.filter { (type, value) -> baseline[type]?.let { value > it } == true }.keys.toList()

fun computeRecords(sets: List<SetPerformance>): Map<RecordType, Double> {
    val records = mutableMapOf<RecordType, Double>()
    for (set in sets) {
        if (set.setType == "warmup") continue
        val weight = set.weight
        val reps = set.reps
        if (weight != null && set.exerciseType.allowsMaxWeight()) {
            records[RecordType.MAX_WEIGHT] = maxOf(records[RecordType.MAX_WEIGHT] ?: 0.0, weight)
        }
        if (reps != null && set.exerciseType.allowsMaxReps()) {
            records[RecordType.MAX_REPS] = maxOf(records[RecordType.MAX_REPS] ?: 0.0, reps.toDouble())
        }
        if (weight != null && reps != null && set.exerciseType.allowsVolume()) {
            records[RecordType.MAX_VOLUME] = maxOf(records[RecordType.MAX_VOLUME] ?: 0.0, weight * reps)
        }
        if (weight != null && reps != null && set.exerciseType.allowsEstimatedOneRepMax()) {
            val estimated = estimatedOneRepMax(weight, reps)
            if (estimated != null) {
                records[RecordType.EST_1RM] = maxOf(records[RecordType.EST_1RM] ?: 0.0, estimated)
            }
        }
    }
    return records
}

private fun ExerciseType.allowsMaxWeight(): Boolean =
    this == ExerciseType.WEIGHT_REPS ||
        this == ExerciseType.WEIGHTED_BODYWEIGHT ||
        this == ExerciseType.DURATION_WEIGHT ||
        this == ExerciseType.WEIGHT_DISTANCE

private fun ExerciseType.allowsMaxReps(): Boolean =
    this == ExerciseType.REPS_ONLY || this == ExerciseType.ASSISTED_BODYWEIGHT

private fun ExerciseType.allowsVolume(): Boolean =
    this == ExerciseType.WEIGHT_REPS

private fun ExerciseType.allowsEstimatedOneRepMax(): Boolean =
    this == ExerciseType.WEIGHT_REPS
