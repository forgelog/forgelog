package dev.bishnoi.forgelog.wear.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkoutRepositoryTest {
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

    private fun seedWorkout(): String = runBlocking {
        val dao = db.workoutDao()
        dao.insertWorkout(
            WorkoutEntity("w1", routineId = null, name = "Test", startedAt = "t0", endedAt = null),
        )
        dao.insertWorkoutExercise(
            WorkoutExerciseEntity("we1", "w1", "ex1", 0, null, "weight_reps", 90),
        )
        dao.insertLoggedSet(
            LoggedSetEntity("s1", "we1", 0, "normal", 40.0, 10, null, null, null, false, null),
        )
        dao.insertLoggedSet(
            LoggedSetEntity("s2", "we1", 1, "normal", 40.0, 8, null, null, null, false, null),
        )
        "w1"
    }

    @Test
    fun discardWorkout_removes_workout_and_all_children() = runBlocking {
        val workoutId = seedWorkout()
        val dao = db.workoutDao()
        assertNotNull(dao.getWorkout(workoutId))
        assertEquals(1, dao.workoutExercises(workoutId).size)
        assertEquals(2, dao.observeLoggedSetsForWorkout(workoutId).first().size)

        repo.discardWorkout(workoutId)

        assertNull(dao.getWorkout(workoutId))
        assertEquals(0, dao.workoutExercises(workoutId).size)
        assertEquals(0, dao.observeLoggedSetsForWorkout(workoutId).first().size)
        // A discarded workout must never enter the sync WAL.
        assertEquals(0, dao.unsyncedWorkouts().size)
    }

    @Test
    fun deleteExercise_removes_exercise_and_its_sets_only() = runBlocking {
        val workoutId = seedWorkout()
        val dao = db.workoutDao()

        repo.deleteExercise("we1")

        assertNotNull(dao.getWorkout(workoutId))
        assertNull(dao.getWorkoutExercise("we1"))
        assertEquals(0, dao.loggedSets("we1").size)
    }

    @Test
    fun cycleSetType_advances_the_stored_type() = runBlocking {
        seedWorkout()
        val dao = db.workoutDao()
        val set = dao.loggedSets("we1").first()

        repo.cycleSetType(set)

        assertEquals("warmup", dao.loggedSets("we1").first { it.id == set.id }.setType)
    }
}
