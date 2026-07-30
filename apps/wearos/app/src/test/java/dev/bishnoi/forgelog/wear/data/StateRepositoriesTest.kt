package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStoreFactory
import dev.bishnoi.forgelog.wear.sync.ExerciseDto
import dev.bishnoi.forgelog.wear.sync.PersonalRecordDto
import dev.bishnoi.forgelog.wear.sync.RoutineDetailDto
import dev.bishnoi.forgelog.wear.sync.RoutineExerciseDetailDto
import dev.bishnoi.forgelog.wear.sync.RoutineSetDto
import dev.bishnoi.forgelog.wear.sync.SYNC_PROTOCOL_VERSION
import dev.bishnoi.forgelog.wear.sync.SyncSnapshot
import dev.bishnoi.forgelog.wear.sync.UserProfileDto
import dev.bishnoi.forgelog.wear.sync.WorkoutReceipt
import dev.bishnoi.forgelog.wear.sync.WorkoutMailbox
import dev.bishnoi.forgelog.wear.sync.WorkoutReplicaState
import dev.bishnoi.forgelog.wear.sync.WorkoutWriter
import java.io.File
import java.nio.file.Files
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class StateRepositoriesTest {
    private lateinit var directory: File
    private lateinit var storeScope: CoroutineScope
    private lateinit var referenceRepository: ReferenceRepository
    private lateinit var workoutRepository: WorkoutRepository
    private lateinit var ids: ArrayDeque<String>

    @Before
    fun setUp() {
        directory = Files.createTempDirectory("wear-json-store").toFile()
        ids = ArrayDeque(
            listOf("w1", "we1", "s1", "w2", "we2", "s2", "w3", "we3", "s3", "extra"),
        )
        storeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        referenceRepository = ReferenceRepository(
            DataStoreFactory.create(
                serializer = ReferenceStateSerializer,
                scope = storeScope,
                produceFile = { File(directory, "reference-state.json") },
            ),
        )
        workoutRepository = WorkoutRepository(
            store = DataStoreFactory.create(
                serializer = WorkoutStateSerializer,
                scope = storeScope,
                produceFile = { File(directory, "workout-state.json") },
            ),
            references = referenceRepository,
            now = { Instant.parse("2026-07-23T10:00:00Z") },
            newId = { ids.removeFirst() },
        )
    }

    @After
    fun tearDown() {
        storeScope.cancel()
        directory.deleteRecursively()
    }

    @Test
    fun `reference snapshot replacement removes stale routines and exposes profile`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        assertEquals("Jordan", referenceRepository.state.first().snapshot?.profile?.name)
        assertEquals(listOf("r1"), referenceRepository.routines.first().map { it.id })

        referenceRepository.replaceSnapshot(snapshot(routines = emptyList(), records = emptyList()))

        assertEquals(emptyList<RoutineDetailDto>(), referenceRepository.routines.first())
        assertEquals(emptyList<PersonalRecordDto>(), referenceRepository.state.first().snapshot?.personalRecords)
    }

    @Test
    fun `unsupported snapshot preserves the last known good state`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())

        val error = runCatching {
            referenceRepository.replaceSnapshot(snapshot().copy(protocolVersion = 99))
        }.exceptionOrNull()

        assertEquals(IllegalArgumentException::class.java, error?.javaClass)
        assertEquals(listOf("r1"), referenceRepository.routines.first().map { it.id })
    }

    @Test
    fun `invalid snapshot enums preserve the last known good state`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        val invalid = snapshot(routines = emptyList(), records = emptyList()).copy(
            profile = UserProfileDto("Jordan", sex = "invalid"),
        )

        val error = runCatching { referenceRepository.replaceSnapshot(invalid) }.exceptionOrNull()

        assertEquals(IllegalArgumentException::class.java, error?.javaClass)
        assertEquals(listOf("r1"), referenceRepository.routines.first().map { it.id })
    }

    @Test
    fun `active workout snapshots reference values and persists edits`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())

        val workout = workoutRepository.startWorkout("r1")
        workoutRepository.updateSetValues("s1", weight = 75.0, reps = 5)
        workoutRepository.markSetCompleted("s1", completed = true)

        val active = workoutRepository.state.first().activeWorkout
        assertEquals("w1", workout.id)
        assertEquals("Bench Press", active?.exercises?.single()?.exerciseName)
        assertEquals(62.5, active?.exercises?.single()?.initialRecords?.get("max_weight"))
        assertEquals(75.0, active?.exercises?.single()?.sets?.single()?.weight)
        assertEquals(true, active?.exercises?.single()?.sets?.single()?.completed)
    }

    @Test
    fun `finish atomically clears active workout and queues outbound payload until ack`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        val payload = workoutRepository.finishWorkout("w1")

        val finished = workoutRepository.state.first()
        assertNull(finished.activeWorkout)
        assertEquals("w1", payload.workoutId)
        assertEquals(
            Instant.parse("2026-07-23T10:00:00Z").toEpochMilli() + 1,
            (payload.state as WorkoutReplicaState.Finished).endedAtMs,
        )
        assertEquals(listOf("w1"), finished.pendingFinished.map { it.workoutId })

        workoutRepository.consumeReceipt(
            WorkoutReceipt(payload.workoutId, payload.startedAtMs, payload.changedAtMs),
        )

        assertEquals(emptyList<Any>(), workoutRepository.state.first().pendingFinished)
    }

    @Test
    fun `pending finish keeps the mailbox while a later workout remains locally usable`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        val finishedA = workoutRepository.finishWorkout("w1")
        val workoutB = workoutRepository.startWorkout("r1")
        workoutRepository.updateSetValues(workoutB.exercises.single().sets.single().id, 70.0, 6)

        val state = workoutRepository.state.first()
        assertEquals("w1", state.pendingFinished.single().workoutId)
        assertEquals("w1", state.desiredMailbox.candidate?.workoutId)
        assertEquals(workoutB.id, state.activeWorkout?.id)
        assertEquals(finishedA, state.pendingFinished.single())
    }

    @Test
    fun `three pending finishes drain in exact receipt order`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        val finished = mutableListOf<dev.bishnoi.forgelog.wear.sync.WorkoutReplica>()
        repeat(3) {
            val workout = workoutRepository.startWorkout("r1")
            finished += workoutRepository.finishWorkout(workout.id)
        }

        assertEquals(finished.map { it.workoutId }, workoutRepository.state.first().pendingFinished.map { it.workoutId })
        for ((index, candidate) in finished.withIndex()) {
            assertEquals(candidate, workoutRepository.state.first().desiredMailbox.candidate)
            workoutRepository.consumeReceipt(
                WorkoutReceipt(candidate.workoutId, candidate.startedAtMs, candidate.changedAtMs),
            )
            assertEquals(
                finished.getOrNull(index + 1),
                workoutRepository.state.first().desiredMailbox.candidate,
            )
        }
        assertEquals(emptyList<Any>(), workoutRepository.state.first().pendingFinished)
    }

    @Test
    fun `phone mailbox joins independent active edits`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val base = workoutRepository.state.first().resolvedReplicas.single().replica
        workoutRepository.updateSetValues("s1", 75.0, 5)
        val baseActive = base.state as WorkoutReplicaState.Active
        val phoneStamp = base.changedAtMs + 2
        val phone = base.copy(
            changedAtMs = phoneStamp,
            state = WorkoutReplicaState.Active(
                baseActive.workout.copy(
                    fields = baseActive.workout.fields.copy(
                        notes = baseActive.workout.fields.notes.copy(
                            version = baseActive.workout.fields.notes.version.copy(
                                changedAtMs = phoneStamp,
                                writer = WorkoutWriter.PHONE,
                            ),
                            value = "Phone note",
                        ),
                    ),
                ),
            ),
        )

        workoutRepository.applyPhoneMailbox(WorkoutMailbox(candidate = phone))

        val resolved = workoutRepository.state.first().resolvedReplicas.single().replica
        val active = resolved.state as WorkoutReplicaState.Active
        assertEquals("Phone note", active.workout.fields.notes.value)
        assertEquals(75.0, active.workout.exercises.single().sets.first().value?.weight)
        assertEquals(WorkoutWriter.WATCH, workoutRepository.state.first().resolvedReplicas.single().writer)
    }

    @Test
    fun `late older join preserves the newer workout transport intent`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val baseA = workoutRepository.state.first().resolvedReplicas.single().replica
        workoutRepository.updateSetValues("s1", 70.0, 5)
        val phoneB = baseA.copy(
            workoutId = "phone-b",
            startedAtMs = baseA.startedAtMs + 1_000,
            changedAtMs = baseA.changedAtMs + 1_000,
        )
        workoutRepository.applyPhoneMailbox(WorkoutMailbox(candidate = phoneB))
        workoutRepository.updateSetValues("s1", 80.0, 5)
        val baseActiveA = baseA.state as WorkoutReplicaState.Active
        val phoneA = baseA.copy(
            changedAtMs = baseA.changedAtMs + 2,
            state = WorkoutReplicaState.Active(
                baseActiveA.workout.copy(
                    fields = baseActiveA.workout.fields.copy(
                        notes = baseActiveA.workout.fields.notes.copy(
                            version = baseActiveA.workout.fields.notes.version.copy(
                                changedAtMs = baseA.changedAtMs + 2,
                                writer = WorkoutWriter.PHONE,
                            ),
                            value = "Late phone note",
                        ),
                    ),
                ),
            ),
        )

        workoutRepository.applyPhoneMailbox(WorkoutMailbox(candidate = phoneA))

        val state = workoutRepository.state.first()
        assertEquals("phone-b", state.transportIntent?.workoutId)
        assertEquals("phone-b", state.desiredMailbox.candidate?.workoutId)
    }

    @Test
    fun `valid receipt advances pending finish even when coexisting candidate is invalid`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val finished = workoutRepository.finishWorkout("w1")
        workoutRepository.startWorkout("r1")
        val invalid = workoutRepository.state.first().resolvedReplicas.last().replica.copy(changedAtMs = 0)

        workoutRepository.applyPhoneMailbox(
            WorkoutMailbox(
                candidate = invalid,
                watchReceipt = WorkoutReceipt(
                    finished.workoutId,
                    finished.startedAtMs,
                    finished.changedAtMs,
                ),
            ),
        )

        val state = workoutRepository.state.first()
        assertEquals(emptyList<Any>(), state.pendingFinished)
        assertEquals(state.activeWorkout?.id, state.desiredMailbox.candidate?.workoutId)
    }

    @Test
    fun `finishing an already queued workout returns the same payload without duplicating it`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val first = workoutRepository.finishWorkout("w1")

        val retry = workoutRepository.finishWorkout("w1")

        assertEquals(first, retry)
        assertEquals(listOf("w1"), workoutRepository.state.first().pendingFinished.map { it.workoutId })
    }

    @Test
    fun `starting another workout cannot overwrite an active workout`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        val error = runCatching { workoutRepository.startWorkout("r1") }.exceptionOrNull()

        assertEquals(ActiveWorkoutExistsException::class.java, error?.javaClass)
        assertEquals("w1", workoutRepository.state.first().activeWorkout?.id)
    }

    @Test
    fun `discard rejects a workout id outside the active session`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        val error = runCatching { workoutRepository.discardWorkout("other") }.exceptionOrNull()

        assertEquals(IllegalArgumentException::class.java, error?.javaClass)
        assertEquals("w1", workoutRepository.state.first().activeWorkout?.id)
    }

    @Test
    fun `start or resume returns the existing active workout without replacing it`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        val original = workoutRepository.startWorkout("r1")

        val resumed = workoutRepository.startOrResumeWorkout("missing-routine")

        assertEquals(original, resumed)
        assertEquals(original, workoutRepository.state.first().activeWorkout)
    }

    @Test
    fun `PR alerts require a phone baseline and fire once per exercise occurrence`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        workoutRepository.updateSetValues("s1", weight = 75.0, reps = 5)

        val firstAlerts = workoutRepository.markSetCompleted("s1", completed = true)
        val secondSet = workoutRepository.addSet("we1")
        workoutRepository.updateSetValues(secondSet.id, weight = 80.0, reps = 5)
        val secondAlerts = workoutRepository.markSetCompleted(secondSet.id, completed = true)

        assertEquals(listOf("max_weight"), firstAlerts.map { it.value })
        assertEquals(emptyList<String>(), secondAlerts.map { it.value })
        assertEquals(
            setOf("max_weight"),
            workoutRepository.state.first().activeWorkout?.exercises?.single()?.alertedRecordTypes,
        )
    }

    @Test
    fun `missing PR baselines stay silent while completed sets establish local comparisons`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot(records = emptyList()))
        workoutRepository.startWorkout("r1")
        workoutRepository.updateSetValues("s1", weight = 75.0, reps = 5)

        val alerts = workoutRepository.markSetCompleted("s1", completed = true)

        assertEquals(emptyList<String>(), alerts.map { it.value })
        assertEquals(
            emptySet<String>(),
            workoutRepository.state.first().activeWorkout?.exercises?.single()?.alertedRecordTypes,
        )
    }

    @Test
    fun `unknown mutation IDs are rejected without changing active state`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val before = workoutRepository.state.first().activeWorkout

        val error = runCatching { workoutRepository.removeSet("missing") }.exceptionOrNull()

        assertEquals(IllegalArgumentException::class.java, error?.javaClass)
        assertEquals(before, workoutRepository.state.first().activeWorkout)
    }

    @Test
    fun `concurrent mutations are serialized without dropping fields`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        coroutineScope {
            val values = async { workoutRepository.updateSetValues("s1", 72.5, 6) }
            val duration = async { workoutRepository.updateSetDuration("s1", 45) }
            values.await()
            duration.await()
        }

        val set = workoutRepository.state.first().activeWorkout?.exercises?.single()?.sets?.single()
        assertEquals(72.5, set?.weight)
        assertEquals(6, set?.reps)
        assertEquals(45, set?.durationSeconds)
    }

    @Test
    fun `discard clears the matching active workout and advertises its terminal fence`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        workoutRepository.discardWorkout("w1")

        assertNull(workoutRepository.state.first().activeWorkout)
        assertEquals(emptyList<Any>(), workoutRepository.pendingFinished.first())
        assertEquals("w1", workoutRepository.state.first().desiredMailbox.candidate?.workoutId)
    }

    private fun snapshot(
        routines: List<RoutineDetailDto> = listOf(routine()),
        records: List<PersonalRecordDto> = listOf(
            PersonalRecordDto("pr1", "ex1", "max_weight", 62.5, "2026-01-01T00:00:00Z"),
        ),
    ) = SyncSnapshot(
        protocolVersion = SYNC_PROTOCOL_VERSION,
        routines = routines,
        personalRecords = records,
        profile = UserProfileDto("Jordan", bodyweightKg = 80.0),
    )

    private fun routine() = RoutineDetailDto(
        id = "r1",
        name = "Push Day",
        position = 0,
        exercises = listOf(
            RoutineExerciseDetailDto(
                id = "re1",
                routineId = "r1",
                exerciseId = "ex1",
                position = 0,
                supersetGroupId = null,
                exerciseType = "weight_reps",
                exercise = ExerciseDto("ex1", "Bench Press", "weight_reps"),
                sets = listOf(
                    RoutineSetDto("rs1", "re1", 0, "normal", 60.0, 8, null, null),
                ),
            ),
        ),
    )
}
