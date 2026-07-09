package dev.bishnoi.forgelog.wear.logic

import java.util.UUID

/**
 * java.util.UUID.randomUUID() already produces the same lowercase v4 TEXT
 * format (8-4-4-4-12 hex, version nibble 4, variant nibble 8-b) as the
 * phone's hand-rolled generator in apps/mobile/src/db/id.ts, so rows created
 * on the watch merge into the phone's SQLite without collision.
 */
fun newId(): String = UUID.randomUUID().toString()
