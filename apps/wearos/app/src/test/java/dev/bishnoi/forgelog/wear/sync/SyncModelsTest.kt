package dev.bishnoi.forgelog.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import kotlinx.serialization.SerializationException

class SyncModelsTest {

    private fun fixtureText(name: String): String =
        checkNotNull(javaClass.classLoader!!.getResourceAsStream(name)) { "fixture not found: $name" }
            .bufferedReader().readText()

    @Test
    fun `decodes a phone-shaped SyncSnapshot JSON`() {
        val json = fixtureText("sync-snapshot.json")

        val snapshot = syncJson.decodeFromString(SyncSnapshot.serializer(), json)

        assertEquals(2, snapshot.protocolVersion)
        assertEquals(1, snapshot.routines.size)
        val routine = snapshot.routines.single()
        assertEquals("Push Day", routine.name)
        val exercise = routine.exercises.single()
        assertEquals("ex1", exercise.exerciseId)
        assertEquals("weight_reps", exercise.exerciseType)
        assertEquals("Bench Press", exercise.exercise.name)
        assertEquals("weight_reps", exercise.exercise.exerciseType)
        assertEquals(60.0, exercise.sets.single().targetWeight)
        assertEquals(62.5, snapshot.personalRecords.single().value, 0.0)
        assertEquals("Jordan", snapshot.profile.name)
        assertEquals("male", snapshot.profile.sex)
        assertEquals("1990-03-14", snapshot.profile.birthDate)
        assertEquals(180.0, snapshot.profile.heightCm)
        assertEquals(80.0, snapshot.profile.bodyweightKg)
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
        assertEquals("weight_reps", exercise.exerciseType)

        val set = exercise.sets.single()
        assertEquals(60.0, set.weight)
        assertEquals(8, set.reps)
        assertEquals(true, set.completed)

        val reEncoded = syncJson.encodeToString(WorkoutPayloadDto.serializer(), payload)

        // Field names on the wire must match the phone's WatchWorkoutPayload
        // (apps/mobile/src/db/repositories/sync.ts) exactly, snake_case included.
        assertEquals(true, reEncoded.contains("\"exercise_id\":\"ex1\""))
        assertEquals(true, reEncoded.contains("\"exercise_type\":\"weight_reps\""))
        assertEquals(true, reEncoded.contains("\"completed_at\""))
        assertEquals(true, reEncoded.contains("\"protocol_version\":2"))

        val decoded = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), reEncoded)
        assertEquals(payload, decoded)
    }

    @Test
    fun `version-skew fixture decodes protocol_version correctly`() {
        val json = fixtureText("version-skew-watch-workout-payload.json")

        val payload = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), json)

        assertEquals(99, payload.protocolVersion)
    }

    @Test
    fun `malformed sync snapshot fixture is rejected`() {
        val json = fixtureText("malformed-sync-snapshot.json")

        assertThrows(SerializationException::class.java) {
            syncJson.decodeFromString(SyncSnapshot.serializer(), json)
        }
    }

    @Test
    fun `version-skew sync snapshot decodes unsupported protocol for caller rejection`() {
        val json = fixtureText("version-skew-sync-snapshot.json")

        val snapshot = syncJson.decodeFromString(SyncSnapshot.serializer(), json)

        assertEquals(99, snapshot.protocolVersion)
    }

    @Test
    fun `malformed watch workout fixture is rejected`() {
        val json = fixtureText("malformed-watch-workout-payload.json")

        assertThrows(SerializationException::class.java) {
            syncJson.decodeFromString(WorkoutPayloadDto.serializer(), json)
        }
    }
}
