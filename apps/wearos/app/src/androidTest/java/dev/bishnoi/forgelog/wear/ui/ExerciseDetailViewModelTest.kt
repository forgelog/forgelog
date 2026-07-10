package dev.bishnoi.forgelog.wear.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.data.PersonalRecordsTracker
import dev.bishnoi.forgelog.wear.data.WorkoutEntity
import dev.bishnoi.forgelog.wear.data.WorkoutExerciseEntity
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExerciseDetailViewModelTest {
    private lateinit var db: AppDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun uiState_maps_logged_set_entity_to_SetRow() = runBlocking {
        val dao = db.workoutDao()
        dao.insertWorkout(WorkoutEntity("w1", null, "Test", "2026-01-01T09:00:00Z", null, false))
        dao.insertWorkoutExercise(WorkoutExerciseEntity("we1", "w1", "ex1", 0, null, "weight_reps", 60))
        dao.insertLoggedSet(
            LoggedSetEntity("s1", "we1", 0, "normal", 75.0, 8, null, null, null, false, null)
        )

        val vm = ExerciseDetailViewModel(
            workoutDao = dao,
            referenceDao = db.referenceDao(),
            workoutRepository = WorkoutRepository(dao, db.referenceDao()),
            recordsTracker = PersonalRecordsTracker(db.referenceDao()),
            workoutExerciseId = "we1",
        )

        val state = vm.uiState.first { it.sets.isNotEmpty() }
        val row = state.sets[0]

        assertEquals("s1", row.id)
        assertEquals("normal", row.setType)
        assertEquals(75.0, row.weight)
        assertEquals(8, row.reps)
        assertFalse(row.completed)
    }
}
