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

class StatePersistenceTest {
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
