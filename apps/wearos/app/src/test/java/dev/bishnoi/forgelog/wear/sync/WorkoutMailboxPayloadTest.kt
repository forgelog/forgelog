package dev.bishnoi.forgelog.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WorkoutMailboxPayloadTest {
    @Test
    fun `malformed candidate does not suppress a valid receipt`() {
        val decoded = decodeWorkoutMailboxPayload(
            """
                {
                  "protocol_version": 1,
                  "candidate": {"workout_id": "broken"},
                  "watch_receipt": {
                    "workout_id": "finished-1",
                    "watch_started_at_ms": 100,
                    "watch_changed_at_ms": 200
                  }
                }
            """.trimIndent(),
        )

        assertNull(decoded?.candidate)
        assertEquals(WorkoutReceipt("finished-1", 100, 200), decoded?.watchReceipt)
    }

    @Test
    fun `unsupported or non-canonical outer mailbox is rejected`() {
        assertNull(
            decodeWorkoutMailboxPayload(
                """{"protocol_version":2,"candidate":null,"watch_receipt":null}""",
            ),
        )
        assertNull(
            decodeWorkoutMailboxPayload(
                """{"protocol_version":1,"candidate":null,"watch_receipt":null,"extra":true}""",
            ),
        )
    }

    @Test
    fun `invalid receipt is ignored independently`() {
        val decoded = decodeWorkoutMailboxPayload(
            """
                {
                  "protocol_version": 1,
                  "candidate": null,
                  "watch_receipt": {"workout_id": "missing-times"}
                }
            """.trimIndent(),
        )

        assertEquals(WorkoutMailbox(), decoded)
    }

    @Test
    fun `unknown nested candidate fields are rejected`() {
        val decoded = decodeWorkoutMailboxPayload(
            """
                {
                  "protocol_version": 1,
                  "candidate": {
                    "workout_id": "discarded-1",
                    "started_at_ms": 1,
                    "changed_at_ms": 2,
                    "state": {"kind": "discarded"},
                    "unexpected": true
                  },
                  "watch_receipt": null
                }
            """.trimIndent(),
        )

        assertEquals(WorkoutMailbox(), decoded)
    }

    @Test
    fun `missing schema-required finished body fields are rejected`() {
        val decoded = decodeWorkoutMailboxPayload(
            """
                {
                  "protocol_version": 1,
                  "candidate": {
                    "workout_id": "finished-1",
                    "started_at_ms": 1,
                    "changed_at_ms": 2,
                    "state": {
                      "kind": "finished",
                      "ended_at_ms": 2,
                      "workout": {
                        "routine_id": null,
                        "routine_structure_version": null,
                        "name": "Missing notes",
                        "bodyweight_kg": null,
                        "exercises": []
                      }
                    }
                  },
                  "watch_receipt": null
                }
            """.trimIndent(),
        )

        assertEquals(WorkoutMailbox(), decoded)
    }
}
