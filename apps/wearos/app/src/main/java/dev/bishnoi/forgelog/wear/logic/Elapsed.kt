package dev.bishnoi.forgelog.wear.logic

/** Formats elapsed workout time as zero-padded hh:mm:ss. */
fun formatElapsed(totalSeconds: Long): String {
    val safe = totalSeconds.coerceAtLeast(0)
    val hours = safe / 3600
    val minutes = (safe % 3600) / 60
    val seconds = safe % 60
    return "%02d:%02d:%02d".format(hours, minutes, seconds)
}
