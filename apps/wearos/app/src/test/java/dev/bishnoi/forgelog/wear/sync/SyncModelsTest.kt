package dev.bishnoi.forgelog.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncModelsTest {

    private fun fixtureText(name: String): String =
        checkNotNull(javaClass.classLoader!!.getResourceAsStream(name)) { "fixture not found: $name" }
            .bufferedReader().readText()

    @Test
    fun `decodes a phone-shaped SyncSnapshot JSON`() {
        val json = fixtureText("sync-snapshot.json")

        val snapshot = syncJson.decodeFromString(SyncSnapshot.serializer(), json)

        assertEquals(1, snapshot.routines.size)
        val routine = snapshot.routines.single()
        assertEquals("Push Day", routine.name)
        val exercise = routine.exercises.single()
        assertEquals("ex1", exercise.exerciseId)
        assertEquals(90, exercise.restSeconds)
        assertEquals("Bench Press", exercise.exercise.name)
        assertEquals(60.0, exercise.sets.single().targetWeight)
        assertEquals(62.5, snapshot.personalRecords.single().value, 0.0)
    }

    @Test
    fun `round-trips a watch-authored WorkoutPayloadDto`() {
        val json = fixtureText("watch-workout-payload.json")

        val payload = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), json)

        assertEquals("w1", payload.id)
        assertEquals("r1", payload.routineId)
        assertEquals("Push Day", payload.name)
        assertNull(payload.endedAt)

        val exercise = payload.exercises.single()
        assertEquals("ex1", exercise.exerciseId)
        assertEquals(90, exercise.restSeconds)

        val set = exercise.sets.single()
        assertEquals(60.0, set.weight)
        assertEquals(8, set.reps)
        assertEquals(true, set.completed)

        val reEncoded = syncJson.encodeToString(WorkoutPayloadDto.serializer(), payload)

        // Field names on the wire must match the phone's WatchWorkoutPayload
        // (apps/mobile/src/db/repositories/sync.ts) exactly, snake_case included.
        assertEquals(true, reEncoded.contains("\"exercise_id\":\"ex1\""))
        assertEquals(true, reEncoded.contains("\"rest_seconds\":90"))
        assertEquals(true, reEncoded.contains("\"completed_at\""))
        assertEquals(true, reEncoded.contains("\"protocol_version\":1"))

        val decoded = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), reEncoded)
        assertEquals(payload, decoded)
    }

    @Test
    fun `version-skew fixture decodes protocol_version correctly`() {
        val json = fixtureText("version-skew-watch-workout-payload.json")

        val payload = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), json)

        assertEquals(99, payload.protocolVersion)
    }
}
