package dev.bishnoi.forgelog.wear.ui

import dev.bishnoi.forgelog.wear.data.WearRepositoryTestFixture
import dev.bishnoi.forgelog.wear.data.sampleRoutine
import dev.bishnoi.forgelog.wear.data.sampleSnapshot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class RoutineViewModelsTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var fixture: WearRepositoryTestFixture

    @Before
    fun setUp() {
        fixture = WearRepositoryTestFixture(listOf("w1", "we1", "s1", "s2", "we2", "s3"))
    }

    @After
    fun tearDown() {
        fixture.close()
    }

    @Test
    fun `routine list exposes exercise counts and active workout`() = runBlocking {
        fixture.seedReferenceState()
        fixture.workouts.startWorkout("r1")
        val viewModel = RoutineListViewModel(fixture.references, fixture.workouts) { true }

        val routine = withTimeout(5_000) { viewModel.routines.first { it.isNotEmpty() } }.single()
        val active = withTimeout(5_000) { viewModel.activeWorkout.first { it != null } }

        assertEquals(RoutineListItem("r1", "Push Day", 2), routine)
        assertEquals(ActiveWorkoutListItem("w1", "Push Day", "2026-07-23T10:00:00Z"), active)
    }

    @Test
    fun `request sync reports sending then success`() = runBlocking {
        val syncResult = CompletableDeferred<Boolean>()
        val viewModel = RoutineListViewModel(fixture.references, fixture.workouts) { syncResult.await() }

        viewModel.requestSync()
        assertEquals(SyncRequestState.SENDING, viewModel.syncRequestState.value)

        syncResult.complete(true)
        assertEquals(
            SyncRequestState.SENT,
            withTimeout(5_000) { viewModel.syncRequestState.first { it == SyncRequestState.SENT } },
        )
    }

    @Test
    fun `missing reference snapshot requests sync on home entry`() = runBlocking {
        var requests = 0
        val viewModel = RoutineListViewModel(fixture.references, fixture.workouts) {
            requests += 1
            true
        }

        viewModel.requestSyncIfNeeded()

        withTimeout(5_000) { viewModel.syncRequestState.first { it == SyncRequestState.SENT } }
        assertEquals(1, requests)
    }

    @Test
    fun `corrupt workout state is surfaced and blocks routine starts`() = runBlocking {
        fixture.close()
        fixture = WearRepositoryTestFixture(workoutFileContents = "not-json")
        fixture.seedReferenceState()
        val viewModel = RoutineListViewModel(fixture.references, fixture.workouts) { true }

        assertEquals(true, withTimeout(5_000) { viewModel.workoutStorageError.first { it } })
        assertEquals(null, viewModel.activeWorkout.value)

        val error = runCatching { fixture.workouts.startWorkout("r1") }.exceptionOrNull()
        assertEquals(true, error != null)
    }

    @Test
    fun `routine detail disables start when workout state is corrupt`() = runBlocking {
        fixture.close()
        fixture = WearRepositoryTestFixture(workoutFileContents = "not-json")
        fixture.seedReferenceState()
        val viewModel = RoutineDetailViewModel(fixture.references, fixture.workouts, "r1")
        val state = withTimeout(5_000) { viewModel.uiState.first { it.workoutStorageError } }
        var started = false

        viewModel.startWorkout { started = true }

        assertEquals(true, state.workoutStorageError)
        assertEquals(false, started)
    }

    @Test
    fun `routine detail opens existing workout instead of starting another`() = runBlocking {
        fixture.seedReferenceState()
        fixture.workouts.startWorkout("r1")
        val secondRoutine = sampleRoutine().let { routine ->
            routine.copy(
                id = "r2",
                exercises = routine.exercises.map { it.copy(routineId = "r2") },
            )
        }
        fixture.references.replaceSnapshot(sampleSnapshot(routines = listOf(secondRoutine)))
        val viewModel = RoutineDetailViewModel(fixture.references, fixture.workouts, "r2")
        val openedWorkoutId = CompletableDeferred<String>()

        viewModel.startWorkout { openedWorkoutId.complete(it) }

        assertEquals("w1", withTimeout(5_000) { openedWorkoutId.await() })
        assertEquals("w1", fixture.workouts.currentActiveWorkout()?.id)
    }
}
