package dev.bishnoi.forgelog.wear.ui

import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.WearRepositoryTestFixture
import dev.bishnoi.forgelog.wear.logic.RecordType
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class WorkoutViewModelsTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var fixture: WearRepositoryTestFixture

    @Before
    fun setUp() {
        fixture = WearRepositoryTestFixture(listOf("w1", "we1", "s1", "s2", "we2", "s3", "s4"))
    }

    @After
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun `exercise detail maps persisted state and applies editing actions`() = runBlocking {
        fixture.seedReferenceState()
        fixture.workouts.startWorkout("r1")
        val viewModel = ExerciseDetailViewModel(fixture.workouts, "we1")

        val initial = withTimeout(5_000) { viewModel.uiState.first { it.sets.size == 2 } }
        assertEquals("Bench Press", initial.exerciseName)
        assertEquals("s1", initial.sets.first().id)

        viewModel.updateValues("s1", 75.0, 5)
        viewModel.updateDuration("s1", 40)
        viewModel.updateDistance("s1", 500.0)
        viewModel.cycleSetType("s1")

        val updated = withTimeout(5_000) {
            viewModel.uiState.first {
                it.sets.firstOrNull()?.let { set ->
                    set.weight == 75.0 && set.durationSeconds == 40 &&
                        set.distanceMeters == 500.0 && set.setType == "warmup"
                } == true
            }
        }.sets.first()
        assertEquals(5, updated.reps)
    }

    @Test
    fun `completing a set persists it and emits the new record types`() = runBlocking {
        fixture.seedReferenceState()
        fixture.workouts.startWorkout("r1")
        val viewModel = ExerciseDetailViewModel(fixture.workouts, "we1")
        withTimeout(5_000) { viewModel.uiState.first { it.sets.size == 2 } }
        viewModel.updateValues("s1", 75.0, 5)
        withTimeout(5_000) { viewModel.uiState.first { it.sets.first().weight == 75.0 } }
        val event = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeout(5_000) { viewModel.prEvent.first() }
        }

        viewModel.markDone("s1")

        assertEquals(true, withTimeout(5_000) { viewModel.uiState.first { it.sets.first().completed } }
            .sets.first().completed)
        assertEquals(listOf(RecordType.MAX_WEIGHT), event.await())
    }

    @Test
    fun `workout overview reports progress and finish moves session to outbox`() = runBlocking {
        fixture.seedReferenceState()
        fixture.workouts.startWorkout("r1")
        fixture.workouts.markSetCompleted("s1", true)
        val published = mutableListOf<String>()
        val viewModel = WorkoutOverviewViewModel(
            fixture.workouts,
            FinishWorkout(fixture.workouts, publish = { published += it.id }),
            "w1",
        )

        val rows = withTimeout(5_000) { viewModel.exercises.first { it.size == 2 } }
        assertEquals(ExerciseProgress("we1", "Bench Press", 1, 2, true), rows[0])
        assertEquals(ExerciseProgress("we2", "Plank", 0, 1, false), rows[1])

        val finished = CompletableDeferred<Unit>()
        viewModel.finishWorkout { finished.complete(Unit) }
        withTimeout(5_000) { finished.await() }

        assertEquals(listOf("w1"), published)
        assertEquals(null, fixture.workouts.currentActiveWorkout())
        assertEquals(listOf("w1"), fixture.workouts.pendingUploads.first().map { it.payload.id })
    }
}
