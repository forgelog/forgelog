package dev.bishnoi.forgelog.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.serialization.builtins.ListSerializer

class ActiveWorkoutProtocolTest {
    @Test
    fun sharedMutationFixturesDecodeEveryOperationFamily() {
        val json = requireNotNull(javaClass.classLoader?.getResource("active-workout-mutations.json"))
            .readText()
        val mutations = syncJson.decodeFromString(
            ListSerializer(ActiveWorkoutMutationDto.serializer()),
            json,
        )

        assertEquals(15, mutations.size)
        mutations.forEach { mutation ->
            assertEquals(deriveConflictKeys(mutation.operation, mutation.workoutId), mutation.conflictKeys.sorted())
        }
    }
    @Test
    fun derivesAuthoritativeConflictKeys() {
        assertEquals(
            listOf("workout:workout-1:name"),
            deriveConflictKeys(RenameWorkoutOperation("Heavy Day"), "workout-1"),
        )
        assertEquals(
            listOf("alerts:occurrence-1", "set:set-1:completed", "set:set-1:completed_at"),
            deriveConflictKeys(
                CompleteSetOperation(
                    setId = "set-1",
                    exerciseId = "occurrence-1",
                    completed = true,
                    completedAt = "2026-07-23T10:02:00.000Z",
                    alertedRecordTypes = setOf("max_weight"),
                ),
                "workout-1",
            ),
        )
    }

    @Test
    fun payloadGuardStaysBelowWearDataLayerLimit() {
        assertTrue(ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES < 100_000)
        val result = runCatching { assertActiveWorkoutPayloadSize("x".repeat(100_000)) }
        assertEquals("active_workout_payload_too_large", result.exceptionOrNull()?.message)
    }
}
