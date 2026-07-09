package dev.bishnoi.forgelog.wear.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Verifies the watch's kotlinx.serialization DTOs parse the exact JSON shape
 * apps/mobile/src/db/repositories/sync.ts produces (snake_case DB columns),
 * since a real Bluetooth-paired round trip isn't available in this
 * environment (needs Android Studio's Device Manager pairing wizard or
 * physical devices) — this is the next best verification of the wire
 * contract between the two apps.
 */
class SyncModelsTest {

    @Test
    fun `decodes a phone-shaped SyncSnapshot JSON`() {
        val json = """
            {
              "routines": [
                {
                  "id": "r1",
                  "name": "Push Day",
                  "position": 0,
                  "exercises": [
                    {
                      "id": "re1",
                      "routine_id": "r1",
                      "exercise_id": "ex1",
                      "position": 0,
                      "superset_group_id": null,
                      "rest_seconds": 90,
                      "tracking_type": null,
                      "exercise": { "id": "ex1", "name": "Bench Press", "tracking_type": "weight_reps" },
                      "sets": [
                        {
                          "id": "rs1",
                          "routine_exercise_id": "re1",
                          "position": 0,
                          "set_type": "normal",
                          "target_weight": 60.0,
                          "target_reps": 8,
                          "target_duration_seconds": null,
                          "target_distance_meters": null
                        }
                      ]
                    }
                  ]
                }
              ],
              "personalRecords": [
                { "id": "pr1", "exercise_id": "ex1", "record_type": "max_weight", "value": 62.5, "achieved_at": "2026-01-01T00:00:00Z" }
              ]
            }
        """.trimIndent()

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
        val payload = WorkoutPayloadDto(
            id = "w1",
            routineId = "r1",
            name = "Push Day",
            startedAt = "2026-07-07T00:00:00.000Z",
            endedAt = null,
            exercises = listOf(
                WorkoutExercisePayloadDto(
                    id = "we1",
                    exerciseId = "ex1",
                    position = 0,
                    supersetGroupId = null,
                    trackingType = "weight_reps",
                    restSeconds = 90,
                    sets = listOf(
                        LoggedSetPayloadDto(
                            id = "ls1",
                            workoutExerciseId = "we1",
                            position = 0,
                            setType = "normal",
                            weight = 60.0,
                            reps = 8,
                            durationSeconds = null,
                            distanceMeters = null,
                            rpe = null,
                            completed = true,
                            completedAt = "2026-07-07T00:01:00.000Z",
                        )
                    ),
                )
            ),
        )

        val json = syncJson.encodeToString(WorkoutPayloadDto.serializer(), payload)

        // Field names on the wire must match the phone's WatchWorkoutPayload
        // (apps/mobile/src/db/repositories/sync.ts) exactly, snake_case included.
        assertEquals(true, json.contains("\"exercise_id\":\"ex1\""))
        assertEquals(true, json.contains("\"rest_seconds\":90"))
        assertEquals(true, json.contains("\"completed_at\""))

        val decoded = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), json)
        assertEquals(payload, decoded)
        assertNull(decoded.endedAt)
    }
}
