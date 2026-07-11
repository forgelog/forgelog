package dev.bishnoi.forgelog.wear.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.ExerciseEntity
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.data.PersonalRecordEntity
import dev.bishnoi.forgelog.wear.data.PersonalRecordsTracker
import dev.bishnoi.forgelog.wear.data.WorkoutEntity
import dev.bishnoi.forgelog.wear.data.WorkoutExerciseEntity
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.TrackingType
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExerciseDetailViewModelTest {
    private lateinit var db: AppDatabase
    private lateinit var repo: WorkoutRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        repo = WorkoutRepository(db.workoutDao(), db.referenceDao())
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedExercise(restSeconds: Int? = 60) {
        val dao = db.workoutDao()
        db.referenceDao().upsertExercises(listOf(ExerciseEntity("ex1", "Bench Press", "weight_reps")))
        dao.insertWorkout(WorkoutEntity("w1", null, "Test", "2026-01-01T09:00:00Z", null, false))
        dao.insertWorkoutExercise(WorkoutExerciseEntity("we1", "w1", "ex1", 0, null, "weight_reps", restSeconds))
        dao.insertLoggedSet(
            LoggedSetEntity("s1", "we1", 0, "normal", 75.0, 8, null, null, null, false, null),
        )
        dao.insertLoggedSet(
            LoggedSetEntity("s2", "we1", 1, "normal", 70.0, 6, null, null, null, false, null),
        )
    }

    private fun viewModel(): ExerciseDetailViewModel =
        ExerciseDetailViewModel(
            workoutDao = db.workoutDao(),
            referenceDao = db.referenceDao(),
            workoutRepository = repo,
            recordsTracker = PersonalRecordsTracker(db.referenceDao()),
            workoutExerciseId = "we1",
        )

    private fun waitUntil(message: String, timeoutMs: Long = 5000, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(25)
        }
        assertTrue(message, condition())
    }

    @Test
    fun uiState_maps_logged_set_entity_to_SetRow() = runBlocking {
        seedExercise()
        val vm = viewModel()

        val state = withTimeout(5000) { vm.uiState.first { it.sets.isNotEmpty() } }
        val row = state.sets[0]

        assertEquals("Bench Press", state.exerciseName)
        assertEquals(TrackingType.WEIGHT_REPS, state.trackingType)
        assertEquals("s1", row.id)
        assertEquals("normal", row.setType)
        assertEquals(75.0, row.weight)
        assertEquals(8, row.reps)
        assertFalse(row.completed)
    }

    @Test
    fun markDone_completes_set_and_emits_personal_record_event() = runBlocking {
        seedExercise()
        db.referenceDao().upsertPersonalRecords(
            listOf(PersonalRecordEntity("pr1", "ex1", "max_weight", 60.0, "2026-01-01T00:00:00Z")),
        )
        val vm = viewModel()
        withTimeout(5000) { vm.uiState.first { it.sets.size == 2 } }
        val event = async { withTimeout(5000) { vm.prEvent.first() } }

        vm.markDone("s1")

        val records = event.await()
        vm.skipRest()
        val completed = db.workoutDao().loggedSets("we1").first { it.id == "s1" }
        assertEquals(true, completed.completed)
        assertEquals(true, records.contains(RecordType.MAX_WEIGHT))
        assertEquals(75.0, db.referenceDao().recordsForExercise("ex1").first { it.recordType == "max_weight" }.value, 0.0)
    }

    @Test
    fun markDone_starts_rest_timer_and_skipRest_clears_it() = runBlocking {
        seedExercise(restSeconds = 30)
        val vm = viewModel()
        withTimeout(5000) { vm.uiState.first { it.sets.size == 2 } }

        vm.markDone("s1")

        waitUntil("expected rest timer to start") { vm.uiState.value.restRemaining != null }
        assertTrue(vm.uiState.value.restRemaining in 1..30)

        vm.skipRest()

        waitUntil("expected rest timer to clear") { vm.uiState.value.restRemaining == null }
    }

    @Test
    fun set_editing_actions_persist_through_repository() = runBlocking {
        seedExercise()
        val vm = viewModel()
        withTimeout(5000) { vm.uiState.first { it.sets.size == 2 } }

        vm.updateValues("s1", weight = 82.5, reps = 5)
        withTimeout(5000) { vm.uiState.first { it.sets.first().weight == 82.5 && it.sets.first().reps == 5 } }
        vm.updateDuration("s1", durationSeconds = 40)
        withTimeout(5000) { vm.uiState.first { it.sets.first().durationSeconds == 40 } }
        vm.updateDistance("s1", distanceMeters = 500.0)
        withTimeout(5000) { vm.uiState.first { it.sets.first().distanceMeters == 500.0 } }
        vm.cycleSetType("s1")
        withTimeout(5000) { vm.uiState.first { it.sets.first().setType == "warmup" } }

        val updated = db.workoutDao().loggedSets("we1").first { it.id == "s1" }
        assertEquals(82.5, updated.weight)
        assertEquals(5, updated.reps)
        assertEquals(40, updated.durationSeconds)
        assertEquals(500.0, updated.distanceMeters)
        assertEquals("warmup", updated.setType)
    }

    @Test
    fun add_remove_delete_and_navigation_actions_update_state() = runBlocking {
        seedExercise()
        val vm = viewModel()
        withTimeout(5000) { vm.uiState.first { it.sets.size == 2 } }

        vm.nextSet()
        assertEquals(1, withTimeout(5000) { vm.uiState.first { it.currentIndex == 1 } }.currentIndex)

        vm.prevSet()
        assertEquals(0, withTimeout(5000) { vm.uiState.first { it.currentIndex == 0 } }.currentIndex)

        vm.addSet()
        val withAddedSet = withTimeout(5000) { vm.uiState.first { it.sets.size == 3 } }
        val addedId = withAddedSet.sets.last().id

        vm.removeSet(addedId)
        withTimeout(5000) { vm.uiState.first { it.sets.size == 2 } }
        assertEquals(listOf("s1", "s2"), db.workoutDao().loggedSets("we1").map { it.id })

        vm.deleteExercise {}
        withTimeout(5000) { vm.uiState.first { it.sets.isEmpty() } }

        assertNull(db.workoutDao().getWorkoutExercise("we1"))
    }
}
