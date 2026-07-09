package dev.bishnoi.forgelog.wear.logic

const val DEFAULT_REST_SECONDS = 90

/**
 * Per-exercise rest_seconds (snapshotted at workout start) wins; null falls
 * back to the default. Mirrors apps/mobile/src/screens/setFields.ts
 * resolveRestSeconds.
 */
fun resolveRestSeconds(restSeconds: Int?, defaultSeconds: Int = DEFAULT_REST_SECONDS): Int =
    restSeconds ?: defaultSeconds
