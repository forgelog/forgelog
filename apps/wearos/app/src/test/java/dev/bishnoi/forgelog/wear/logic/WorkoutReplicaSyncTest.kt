package dev.bishnoi.forgelog.wear.logic

import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutBody
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutExercise
import dev.bishnoi.forgelog.wear.sync.ActiveLoggedSet
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutFields
import dev.bishnoi.forgelog.wear.sync.AuthoredWorkoutReplica
import dev.bishnoi.forgelog.wear.sync.EntryVersion
import dev.bishnoi.forgelog.wear.sync.VersionedLong
import dev.bishnoi.forgelog.wear.sync.VersionedNullableDouble
import dev.bishnoi.forgelog.wear.sync.VersionedNullableString
import dev.bishnoi.forgelog.wear.sync.VersionedString
import dev.bishnoi.forgelog.wear.sync.WorkoutWriter
import dev.bishnoi.forgelog.wear.sync.WorkoutBody
import dev.bishnoi.forgelog.wear.sync.WorkoutMailbox
import dev.bishnoi.forgelog.wear.sync.WorkoutExerciseFields
import dev.bishnoi.forgelog.wear.sync.WorkoutReplica
import dev.bishnoi.forgelog.wear.sync.WorkoutReplicaState
import dev.bishnoi.forgelog.wear.sync.WorkoutReceipt
import dev.bishnoi.forgelog.wear.sync.syncJson
import dev.bishnoi.forgelog.wear.sync.validateWorkoutMailbox
import dev.bishnoi.forgelog.wear.sync.validateWorkoutReplica
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private const val WORKOUT_ID = "workout-1"

class WorkoutReplicaSyncTest {
    private fun fixtureText(name: String): String =
        checkNotNull(javaClass.classLoader!!.getResourceAsStream(name)) { "fixture not found: $name" }
            .bufferedReader().readText()

    private fun version(time: Long, writer: WorkoutWriter) = EntryVersion(time, writer)

    private fun body(version: EntryVersion, name: String = "Workout") = ActiveWorkoutBody(
        fields = ActiveWorkoutFields(
            routineId = VersionedNullableString(version, null),
            routineStructureVersion = VersionedLong(version, null),
            name = VersionedString(version, name),
            notes = VersionedNullableString(version, null),
            bodyweightKg = VersionedNullableDouble(version, null),
        ),
    )

    @Test
    fun `entry versions compare by timestamp then writer`() {
        assertTrue(compareEntryVersions(version(2, WorkoutWriter.PHONE), version(1, WorkoutWriter.WATCH)) > 0)
        assertTrue(compareEntryVersions(version(2, WorkoutWriter.WATCH), version(2, WorkoutWriter.PHONE)) > 0)
        assertEquals(0, compareEntryVersions(version(2, WorkoutWriter.PHONE), version(2, WorkoutWriter.PHONE)))
    }

    @Test
    fun `active joins are commutative associative and idempotent`() {
        val a = body(version(1, WorkoutWriter.PHONE), "A")
        val b = body(version(2, WorkoutWriter.WATCH), "B").copy(
            fields = body(version(2, WorkoutWriter.WATCH), "B").fields.copy(
                notes = VersionedNullableString(version(3, WorkoutWriter.WATCH), "B notes"),
            ),
        )
        val c = body(version(4, WorkoutWriter.PHONE), "C")

        assertEquals(joinActiveWorkoutBodies(a, b), joinActiveWorkoutBodies(b, a))
        assertEquals(a, joinActiveWorkoutBodies(a, a))
        assertEquals(
            joinActiveWorkoutBodies(joinActiveWorkoutBodies(a, b), c),
            joinActiveWorkoutBodies(a, joinActiveWorkoutBodies(b, c)),
        )
    }

    @Test
    fun `shared mailbox fixture decodes with the version one contract`() {
        val mailbox = syncJson.decodeFromString(WorkoutMailbox.serializer(), fixtureText("workout-mailbox.json"))

        assertEquals(1, mailbox.protocolVersion)
        assertEquals(WORKOUT_ID, mailbox.candidate?.workoutId)
        assertTrue(mailbox.candidate?.state is WorkoutReplicaState.Active)
    }

    @Test
    fun `finished state wins unchanged and current generation ignores lifecycle rank`() {
        val active = AuthoredWorkoutReplica(
            WorkoutWriter.PHONE,
            WorkoutReplica(WORKOUT_ID, 100, 9, WorkoutReplicaState.Active(body(version(9, WorkoutWriter.PHONE)))),
        )
        val finished = AuthoredWorkoutReplica(
            WorkoutWriter.WATCH,
            WorkoutReplica(
                WORKOUT_ID,
                100,
                8,
                WorkoutReplicaState.Finished(108, WorkoutBody(name = "Watch snapshot")),
            ),
        )

        assertEquals(finished, resolveSameWorkout(active, finished, WorkoutWriter.PHONE, 10))

        val newer = active.copy(replica = active.replica.copy(workoutId = "workout-2", startedAtMs = 200))
        assertEquals(newer, selectCurrentGeneration(listOf(finished, newer)))
    }

    @Test
    fun `watch outbound selection preserves the oldest pending finish`() {
        val pendingA = WorkoutReplica(
            "a",
            1,
            10,
            WorkoutReplicaState.Finished(10, WorkoutBody(name = "A")),
        )
        val pendingB = WorkoutReplica(
            "b",
            2,
            20,
            WorkoutReplicaState.Finished(20, WorkoutBody(name = "B")),
        )
        val active = WorkoutReplica(
            "c",
            3,
            30,
            WorkoutReplicaState.Active(body(version(30, WorkoutWriter.WATCH))),
        )

        assertEquals(pendingA, selectOutboundCandidate(WorkoutWriter.WATCH, listOf(pendingA, pendingB), active))
        assertEquals(active, selectOutboundCandidate(WorkoutWriter.PHONE, listOf(pendingA), active))
    }

    @Test
    fun `negative receipt timestamps are ignored independently`() {
        val mailbox = validateWorkoutMailbox(
            WorkoutWriter.PHONE,
            WorkoutMailbox(watchReceipt = WorkoutReceipt(WORKOUT_ID, -1, 2)),
            emptyList(),
        )

        assertEquals(WorkoutMailbox(), mailbox?.let {
            WorkoutMailbox(candidate = it.candidate, watchReceipt = it.watchReceipt)
        })
    }

    @Test
    fun `live entries require both a position and a value`() {
        val stamp = version(1, WorkoutWriter.PHONE)
        val invalidExercise = WorkoutReplica(
            WORKOUT_ID,
            1,
            1,
            WorkoutReplicaState.Active(
                body(stamp).copy(
                    exercises = listOf(
                        ActiveWorkoutExercise(
                            id = "exercise-1",
                            version = stamp,
                            deleted = false,
                            position = 0,
                            value = null,
                        ),
                    ),
                ),
            ),
        )
        val invalidSet = invalidExercise.copy(
            state = WorkoutReplicaState.Active(
                body(stamp).copy(
                    exercises = listOf(
                        ActiveWorkoutExercise(
                            id = "exercise-1",
                            version = stamp,
                            deleted = false,
                            position = 0,
                            value = WorkoutExerciseFields(
                                exerciseId = "catalog-1",
                                exerciseName = "Bench Press",
                                exerciseType = "weight_reps",
                            ),
                            sets = listOf(
                                ActiveLoggedSet(
                                    id = "set-1",
                                    version = stamp,
                                    deleted = false,
                                    position = 0,
                                    value = null,
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )

        assertFalse(validateWorkoutReplica(WorkoutWriter.PHONE, invalidExercise, emptyList()))
        assertFalse(validateWorkoutReplica(WorkoutWriter.PHONE, invalidSet, emptyList()))
    }
}
