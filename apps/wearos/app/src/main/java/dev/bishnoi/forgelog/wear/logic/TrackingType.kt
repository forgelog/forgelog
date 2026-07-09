package dev.bishnoi.forgelog.wear.logic

enum class TrackingType(val value: String) {
    WEIGHT_REPS("weight_reps"),
    REPS_ONLY("reps_only"),
    DURATION("duration"),
    DURATION_DISTANCE("duration_distance");

    companion object {
        fun fromValue(value: String?): TrackingType? = entries.find { it.value == value }
    }
}

/**
 * Resolve the type actually in effect: a per-context override wins over the
 * catalog default; both may be null, in which case we default to weight x
 * reps. Mirrors apps/mobile/src/screens/setFields.ts effectiveTrackingType —
 * must stay in sync with it since workout rows move between phone and watch.
 */
fun effectiveTrackingType(override: String?, catalogDefault: String?): TrackingType =
    TrackingType.fromValue(override)
        ?: TrackingType.fromValue(catalogDefault)
        ?: TrackingType.WEIGHT_REPS
