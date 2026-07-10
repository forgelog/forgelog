package dev.bishnoi.forgelog.wear.logic

/** Matches apps/mobile/src/db/types.ts SetType so synced rows round-trip. */
val SET_TYPES = listOf("normal", "warmup", "dropset", "failure")

/** Cycles to the next set type, wrapping around; unknown values reset to "normal". */
fun nextSetType(current: String): String {
    val index = SET_TYPES.indexOf(current)
    if (index < 0) return SET_TYPES.first()
    return SET_TYPES[(index + 1) % SET_TYPES.size]
}

/** Short label shown on the set editor, e.g. "Warmup". Empty for the default "normal". */
fun setTypeLabel(setType: String): String = when (setType) {
    "warmup" -> "Warmup"
    "dropset" -> "Drop set"
    "failure" -> "To failure"
    else -> ""
}
