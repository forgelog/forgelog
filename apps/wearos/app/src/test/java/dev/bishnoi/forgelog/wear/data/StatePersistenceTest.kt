package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStoreFactory
import java.io.File
import java.nio.file.Files
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.job
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutResultDto
import dev.bishnoi.forgelog.wear.sync.RecoverWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.StartWorkoutOperation

class StatePersistenceTest {
    @Test
    fun `first coordinator state preserves a locally started workout as a start mutation`() = runBlocking {
        WearRepositoryTestFixture(ids = listOf("w1", "we1", "s1", "s2", "we2", "s3", "device-1", "start-op")).use {
            it.seedReferenceState()
            it.workouts.startWorkout("r1")

            assertEquals(true, it.workouts.applyCanonicalState(canonicalNone("epoch-1")))
            val state = it.workouts.state.first()
            assertEquals("w1", state.activeWorkout?.id)
            assertEquals("epoch-1", state.coordinatorEpoch)
            assertEquals(1L, state.pendingMutations.single().deviceSequence)
            assertTrue(state.pendingMutations.single().operation is StartWorkoutOperation)
        }
    }

    @Test
    fun `keeping canonical state clears the rejected optimistic workout and conflict drafts`() = runBlocking {
        WearRepositoryTestFixture(ids = listOf("device-1", "w1", "we1", "s1", "s2", "we2", "s3", "start-op")).use {
            it.seedReferenceState()
            it.workouts.applyCanonicalState(canonicalNone("epoch-1"))
            it.workouts.startWorkout("r1")
            val mutation = it.workouts.state.first().pendingMutations.single()
            it.workouts.applyOperationResult(ActiveWorkoutResultDto(
                coordinatorEpoch = "epoch-1",
                deviceId = "device-1",
                deviceSequence = 1,
                operationId = mutation.operationId,
                status = "needs_resolution",
                canonicalRevision = 0,
                reason = "independent_active_workout",
            ))

            it.workouts.applyOperationResult(ActiveWorkoutResultDto(
                coordinatorEpoch = "epoch-1",
                deviceId = "device-1",
                deviceSequence = 1,
                operationId = mutation.operationId,
                status = "resolved",
                canonicalRevision = 0,
                resolution = "canonical_kept",
                resolutionRevision = 0,
            ))

            val resolved = it.workouts.state.first()
            assertEquals(null, resolved.activeWorkout)
            assertTrue(resolved.pendingMutations.isEmpty())
            assertTrue(resolved.rejectedMutations.isEmpty())
            assertTrue(resolved.conflictDrafts.isEmpty())
        }
    }

    @Test
    fun `coordinator epoch change preserves optimistic workout as one recovery proposal`() = runBlocking {
        WearRepositoryTestFixture(ids = listOf("device-1", "w1", "we1", "s1", "s2", "we2", "s3", "start-op", "recovery-op")).use {
            it.seedReferenceState()
            it.workouts.applyCanonicalState(canonicalNone("epoch-1"))
            it.workouts.startWorkout("r1")

            assertEquals(false, it.workouts.applyCanonicalState(canonicalNone("epoch-2")))
            val recovered = it.workouts.state.first()
            assertEquals("epoch-2", recovered.coordinatorEpoch)
            assertEquals(1L, recovered.pendingMutations.single().deviceSequence)
            assertTrue(recovered.pendingMutations.single().operation is RecoverWorkoutOperation)
            assertEquals("w1", recovered.recoveryDraft?.workout?.id)
        }
    }

    private fun canonicalNone(epoch: String) = dev.bishnoi.forgelog.wear.sync.CanonicalActiveWorkoutState(
        coordinatorId = "phone-1",
        coordinatorEpoch = epoch,
        revision = 0,
        revisionCommittedAt = "2026-07-23T09:00:00Z",
        lifecycle = "none",
    )

    @Test
    fun `protocol identity and optimistic mutation survive DataStore recreation`() = runBlocking {
        val directory = Files.createTempDirectory("wear-protocol-recreation").toFile()
        val firstScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val firstReferences = referenceRepository(firstScope, directory)
            val ids = ArrayDeque(listOf("device-1", "w1", "we1", "s1", "s2", "we2", "s3", "start-op"))
            val firstWorkouts = workoutRepository(firstScope, directory, firstReferences) { ids.removeFirst() }
            firstReferences.replaceSnapshot(sampleSnapshot())
            firstWorkouts.applyCanonicalState(canonicalNone("epoch-1"))
            firstWorkouts.startWorkout("r1")

            firstScope.coroutineContext.job.cancelAndJoin()

            val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            try {
                val secondReferences = referenceRepository(secondScope, directory)
                val secondWorkouts = workoutRepository(secondScope, directory, secondReferences) { "unused" }
                val restored = secondWorkouts.state.first()
                assertEquals("device-1", restored.installationId)
                assertEquals(2L, restored.nextDeviceSequence)
                assertEquals(1, restored.pendingMutations.size)
                assertNotNull(restored.activeWorkout)
            } finally {
                secondScope.coroutineContext.job.cancelAndJoin()
            }
        } finally {
            if (firstScope.coroutineContext.job.isActive) {
                firstScope.coroutineContext.job.cancelAndJoin()
            }
            directory.deleteRecursively()
        }
    }
    @Test
    fun `active workout survives repository and DataStore recreation`() = runBlocking {
        val directory = Files.createTempDirectory("wear-recreation").toFile()
        val firstScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val firstReferences = referenceRepository(firstScope, directory)
            val ids = ArrayDeque(listOf("w1", "we1", "s1", "s2", "we2", "s3"))
            val firstWorkouts = workoutRepository(firstScope, directory, firstReferences) { ids.removeFirst() }
            firstReferences.replaceSnapshot(sampleSnapshot())
            firstWorkouts.startWorkout("r1")
            firstWorkouts.updateSetValues("s1", 77.5, 4)
            firstWorkouts.markSetCompleted("s1", true)

            firstScope.coroutineContext.job.cancelAndJoin()

            val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            try {
                val secondReferences = referenceRepository(secondScope, directory)
                val secondWorkouts = workoutRepository(secondScope, directory, secondReferences) { "unused" }

                val restored = secondWorkouts.state.first().activeWorkout
                assertEquals("w1", restored?.id)
                assertEquals("Bench Press", restored?.exercises?.first()?.exerciseName)
                assertEquals(77.5, restored?.exercises?.first()?.sets?.first()?.weight)
                assertEquals(true, restored?.exercises?.first()?.sets?.first()?.completed)
                assertEquals("Jordan", secondReferences.currentProfile()?.name)
            } finally {
                secondScope.coroutineContext.job.cancelAndJoin()
            }
        } finally {
            if (firstScope.coroutineContext.job.isActive) {
                firstScope.coroutineContext.job.cancelAndJoin()
            }
            directory.deleteRecursively()
        }
    }

    private fun referenceRepository(scope: CoroutineScope, directory: File) = ReferenceRepository(
        DataStoreFactory.create(
            serializer = ReferenceStateSerializer,
            scope = scope,
            produceFile = { File(directory, "reference-state.json") },
        ),
    )

    private fun workoutRepository(
        scope: CoroutineScope,
        directory: File,
        references: ReferenceRepository,
        newId: () -> String,
    ) = WorkoutRepository(
        DataStoreFactory.create(
            serializer = WorkoutStateSerializer,
            scope = scope,
            produceFile = { File(directory, "workout-state.json") },
        ),
        references,
        now = { Instant.parse("2026-07-23T10:00:00Z") },
        newId = newId,
    )
}
