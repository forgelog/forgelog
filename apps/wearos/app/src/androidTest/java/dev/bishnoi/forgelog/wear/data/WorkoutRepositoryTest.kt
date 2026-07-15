package dev.bishnoi.forgelog.wear.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.data.ExerciseEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

private const val PUSH_DAY_NAME = "Push Day"

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
        dao.insertWorkoutExercise(WorkoutExerciseEntity("we1", "w1", "ex1", 0, null, "weight_reps"))
        dao.insertLoggedSet(
            LoggedSetEntity("s1", "we1", 0, "normal", 40.0, 10, null, null, null, false, null),
        )
        dao.insertLoggedSet(
            LoggedSetEntity("s2", "we1", 1, "normal", 40.0, 8, null, null, null, false, null),
        )
        "w1"
    }

    private suspend fun seedRoutine() {
        val referenceDao = db.referenceDao()
        referenceDao.upsertExercises(
            listOf(
                ExerciseEntity("ex1", "Bench Press", "weight_reps"),
                ExerciseEntity("ex2", "Plank", "duration"),
            ),
        )
        referenceDao.upsertRoutines(listOf(RoutineEntity("r1", PUSH_DAY_NAME, 0)))
        referenceDao.upsertRoutineExercises(
            listOf(
                RoutineExerciseEntity(
                    id = "re1",
                    routineId = "r1",
                    exerciseId = "ex1",
                    position = 0,
                    supersetGroupId = "sg1",
                    exerciseType = "reps_only",
                ),
                RoutineExerciseEntity(
                    id = "re2",
                    routineId = "r1",
                    exerciseId = "ex2",
                    position = 1,
                    supersetGroupId = null,
                    exerciseType = "duration",
                ),
            ),
        )
        referenceDao.upsertRoutineSets(
            listOf(
                RoutineSetEntity("rs1", "re1", 0, "warmup", 40.0, 10, null, null),
                RoutineSetEntity("rs2", "re1", 1, "normal", 60.0, 8, null, null),
                RoutineSetEntity("rs3", "re2", 0, "normal", null, null, 45, null),
            ),
        )
    }

    @Test
    fun discardWorkoutRemovesWorkoutAndAllChildren() = runBlocking {
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
    fun deleteExerciseRemovesExerciseAndItsSetsOnly() = runBlocking {
        val workoutId = seedWorkout()
        val dao = db.workoutDao()

        repo.deleteExercise("we1")

        assertNotNull(dao.getWorkout(workoutId))
        assertNull(dao.getWorkoutExercise("we1"))
        assertEquals(0, dao.loggedSets("we1").size)
    }

    @Test
    fun cycleSetTypeAdvancesTheStoredType() = runBlocking {
        seedWorkout()
        val dao = db.workoutDao()
        val set = dao.loggedSets("we1").first()

        repo.cycleSetType(set)

        assertEquals("warmup", dao.loggedSets("we1").first { it.id == set.id }.setType)
    }

    @Test
    fun startWorkoutCopiesRoutineToSessionAndSnapshotsEffectiveFields() = runBlocking {
        seedRoutine()

        val workout = repo.startWorkout("r1")

        assertEquals(PUSH_DAY_NAME, workout.name)
        assertEquals("r1", workout.routineId)

        val workoutExercises = db.workoutDao().workoutExercises(workout.id)
        assertEquals(2, workoutExercises.size)

        val bench = workoutExercises[0]
        assertEquals("ex1", bench.exerciseId)
        assertEquals("sg1", bench.supersetGroupId)
        assertEquals("reps_only", bench.exerciseType)

        val plank = workoutExercises[1]
        assertEquals("duration", plank.exerciseType)

        val benchSets = db.workoutDao().loggedSets(bench.id)
        assertEquals(2, benchSets.size)
        assertEquals("warmup", benchSets[0].setType)
        assertEquals(40.0, benchSets[0].weight)
        assertEquals(10, benchSets[0].reps)
        assertEquals(false, benchSets[0].completed)

        db.referenceDao().upsertRoutineExercises(
            listOf(
                RoutineExerciseEntity("re1", "r1", "ex1", 0, null, "duration"),
            ),
        )

        assertEquals("reps_only", db.workoutDao().getWorkoutExercise(bench.id)?.exerciseType)
    }

    @Test
    fun startWorkoutRejectsInvalidRoutineExerciseTypeBeforeCreatingWorkout() = runBlocking {
        val referenceDao = db.referenceDao()
        referenceDao.upsertExercises(listOf(ExerciseEntity("ex1", "Bench Press", "weight_reps")))
        referenceDao.upsertRoutines(listOf(RoutineEntity("r1", PUSH_DAY_NAME, 0)))
        referenceDao.upsertRoutineExercises(
            listOf(
                RoutineExerciseEntity(
                    id = "re1",
                    routineId = "r1",
                    exerciseId = "ex1",
                    position = 0,
                    supersetGroupId = null,
                    exerciseType = "bad_type",
                ),
            ),
        )

        try {
            repo.startWorkout("r1")
            fail("Expected invalid exercise type to abort workout creation")
        } catch (error: IllegalArgumentException) {
            assertEquals("Missing or invalid exercise_type: bad_type", error.message)
        }

        assertEquals(0, db.workoutDao().unsyncedWorkouts().size)
    }

    @Test
    fun finishWorkoutSetsEndTimeAndKeepsWorkoutUnsynced() = runBlocking {
        val workoutId = seedWorkout()

        repo.finishWorkout(workoutId)

        val workout = db.workoutDao().getWorkout(workoutId)
        assertNotNull(workout?.endedAt)
        assertEquals(false, workout?.synced)
    }

    @Test
    fun markSetCompletedTogglesCompletionTimestamp() = runBlocking {
        seedWorkout()
        val dao = db.workoutDao()
        val set = dao.loggedSets("we1").first()

        repo.markSetCompleted(set, true)
        val completed = dao.loggedSets("we1").first { it.id == set.id }
        assertEquals(true, completed.completed)
        assertNotNull(completed.completedAt)

        repo.markSetCompleted(completed, false)
        val incomplete = dao.loggedSets("we1").first { it.id == set.id }
        assertEquals(false, incomplete.completed)
        assertNull(incomplete.completedAt)
    }

    @Test
    fun updateSetFieldsPersistIndependently() = runBlocking {
        seedWorkout()
        val dao = db.workoutDao()
        val set = dao.loggedSets("we1").first()

        repo.updateSetValues(set, weight = 72.5, reps = 6)
        val valuesUpdated = dao.loggedSets("we1").first { it.id == set.id }
        assertEquals(72.5, valuesUpdated.weight)
        assertEquals(6, valuesUpdated.reps)

        repo.updateSetDuration(valuesUpdated, 45)
        val durationUpdated = dao.loggedSets("we1").first { it.id == set.id }
        assertEquals(45, durationUpdated.durationSeconds)

        repo.updateSetDistance(durationUpdated, 1200.0)
        val distanceUpdated = dao.loggedSets("we1").first { it.id == set.id }
        assertEquals(1200.0, distanceUpdated.distanceMeters)
    }

    @Test
    fun addSetAppendsNextPositionAndRemoveSetDeletesOnlyThatSet() = runBlocking {
        seedWorkout()
        val dao = db.workoutDao()

        val added = repo.addSet("we1")

        assertEquals(2, added.position)
        assertEquals(false, added.completed)
        assertEquals(3, dao.loggedSets("we1").size)

        repo.removeSet(added.id)

        assertEquals(listOf("s1", "s2"), dao.loggedSets("we1").map { it.id })
    }
}
