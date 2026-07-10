package dev.bishnoi.forgelog.wear.logic

/** Formats elapsed workout time as m:ss (or mmm:ss past an hour). */
fun formatElapsed(totalSeconds: Long): String {
    val safe = totalSeconds.coerceAtLeast(0)
    return "%d:%02d".format(safe / 60, safe % 60)
}
