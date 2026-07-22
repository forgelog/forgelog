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
import java.io.File
import java.nio.file.Files
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

class WearRepositoryTestFixture(
    ids: List<String> = emptyList(),
    workoutFileContents: String? = null,
) : AutoCloseable {
    private val directory = Files.createTempDirectory("wear-repository-test").toFile()
    private val workoutFile = File(directory, "workout-state.json").apply {
        if (workoutFileContents != null) writeText(workoutFileContents)
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queuedIds = ArrayDeque(ids)
    private val generatedId = AtomicInteger()

    val references = ReferenceRepository(
        DataStoreFactory.create(
            serializer = ReferenceStateSerializer,
            scope = scope,
            produceFile = { File(directory, "reference-state.json") },
        ),
    )
    val workouts = WorkoutRepository(
        store = DataStoreFactory.create(
            serializer = WorkoutStateSerializer,
            scope = scope,
            produceFile = { workoutFile },
        ),
        references = references,
        now = { Instant.parse("2026-07-23T10:00:00Z") },
        newId = {
            if (queuedIds.isNotEmpty()) queuedIds.removeFirst()
            else "generated-${generatedId.incrementAndGet()}"
        },
    )

    suspend fun seedReferenceState(snapshot: SyncSnapshot = sampleSnapshot()) {
        references.replaceSnapshot(snapshot)
    }

    override fun close() {
        scope.cancel()
        directory.deleteRecursively()
    }
}

fun sampleSnapshot(
    routines: List<RoutineDetailDto> = listOf(sampleRoutine()),
    records: List<PersonalRecordDto> = listOf(
        PersonalRecordDto("pr1", "ex1", "max_weight", 62.5, "2026-01-01T00:00:00Z"),
    ),
) = SyncSnapshot(
    protocolVersion = SYNC_PROTOCOL_VERSION,
    routines = routines,
    personalRecords = records,
    profile = UserProfileDto("Jordan", bodyweightKg = 80.0),
)

fun sampleRoutine() = RoutineDetailDto(
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
                RoutineSetDto("rs2", "re1", 1, "normal", 55.0, 10, null, null),
            ),
        ),
        RoutineExerciseDetailDto(
            id = "re2",
            routineId = "r1",
            exerciseId = "ex2",
            position = 1,
            supersetGroupId = null,
            exerciseType = "duration",
            exercise = ExerciseDto("ex2", "Plank", "duration"),
            sets = listOf(
                RoutineSetDto("rs3", "re2", 0, "normal", null, null, 45, null),
            ),
        ),
    ),
)
