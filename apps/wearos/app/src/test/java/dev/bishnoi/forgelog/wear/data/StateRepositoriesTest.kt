package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStoreFactory
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.sync.ExerciseDto
import dev.bishnoi.forgelog.wear.sync.PersonalRecordDto
import dev.bishnoi.forgelog.wear.sync.RoutineDetailDto
import dev.bishnoi.forgelog.wear.sync.RoutineExerciseDetailDto
import dev.bishnoi.forgelog.wear.sync.RoutineSetDto
import dev.bishnoi.forgelog.wear.sync.SYNC_PROTOCOL_VERSION
import dev.bishnoi.forgelog.wear.sync.SyncSnapshot
import dev.bishnoi.forgelog.wear.sync.UserProfileDto
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
        ids = ArrayDeque(listOf("w1", "we1", "s1", "s2", "s3"))
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
        assertEquals("w1", payload.id)
        assertEquals("2026-07-23T10:00:00Z", payload.endedAt)
        assertEquals(listOf("w1"), finished.pendingUploads.map { it.payload.id })

        workoutRepository.acknowledgeWorkout("w1")

        assertEquals(emptyList<PendingWorkout>(), workoutRepository.state.first().pendingUploads)
    }

    @Test
    fun `finishing an already queued workout returns the same payload without duplicating it`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val first = workoutRepository.finishWorkout("w1")

        val retry = workoutRepository.finishWorkout("w1")

        assertEquals(first, retry)
        assertEquals(listOf("w1"), workoutRepository.state.first().pendingUploads.map { it.payload.id })
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
    fun `discard clears the matching active workout without creating an upload`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")

        workoutRepository.discardWorkout("w1")

        assertNull(workoutRepository.state.first().activeWorkout)
        assertEquals(emptyList<PendingWorkout>(), workoutRepository.pendingUploads.first())
    }

    @Test
    fun `publish failure retains outbox and successful retry records attempt without deleting it`() = runBlocking {
        referenceRepository.replaceSnapshot(snapshot())
        workoutRepository.startWorkout("r1")
        val failed = FinishWorkout(
            workouts = workoutRepository,
            publish = { throw IllegalStateException("offline") },
            logWarning = { _, _ -> },
        )

        failed("w1")

        assertEquals(1, workoutRepository.state.first().pendingUploads.size)
        assertNull(workoutRepository.state.first().pendingUploads.single().lastPublishAttemptAtEpochMillis)

        val published = mutableListOf<String>()
        FinishWorkout(workoutRepository, publish = { published += it.id }).drainPending()

        assertEquals(listOf("w1"), published)
        val pending = workoutRepository.state.first().pendingUploads.single()
        assertEquals("w1", pending.payload.id)
        assertEquals(Instant.parse("2026-07-23T10:00:00Z").toEpochMilli(), pending.lastPublishAttemptAtEpochMillis)
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
