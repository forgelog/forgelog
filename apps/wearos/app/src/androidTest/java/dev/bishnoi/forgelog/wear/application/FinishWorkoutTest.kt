package dev.bishnoi.forgelog.wear.application

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutEntity
import dev.bishnoi.forgelog.wear.data.WorkoutExerciseEntity
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRepository
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FinishWorkoutTest {
    private lateinit var db: AppDatabase
    private lateinit var dao: WorkoutDao
    private lateinit var workoutRepo: WorkoutRepository
    private lateinit var syncRepo: SyncRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.workoutDao()
        workoutRepo = WorkoutRepository(dao, db.referenceDao())
        syncRepo = SyncRepository(db.referenceDao(), dao)
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedActiveWorkout(id: String = "w1"): String {
        dao.insertWorkout(WorkoutEntity(id, null, "Test", "2026-01-01T09:00:00Z", null, false))
        dao.insertWorkoutExercise(WorkoutExerciseEntity("we1", id, "ex1", 0, null, "weight_reps", 60))
        dao.insertLoggedSet(LoggedSetEntity("s1", "we1", 0, "normal", 60.0, 5, null, null, null, true, "2026-01-01T09:30:00Z"))
        return id
    }

    private suspend fun seedFinishedUnsynced(id: String = "w1"): String {
        dao.insertWorkout(WorkoutEntity(id, null, "Test", "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z", false))
        dao.insertWorkoutExercise(WorkoutExerciseEntity("we1", id, "ex1", 0, null, "weight_reps", 60))
        dao.insertLoggedSet(LoggedSetEntity("s1", "we1", 0, "normal", 60.0, 5, null, null, null, true, "2026-01-01T09:30:00Z"))
        return id
    }

    private suspend fun assertCancellation(block: suspend () -> Unit) {
        try {
            block()
            fail("Expected CancellationException")
        } catch (error: CancellationException) {
            assertEquals("cancelled", error.message)
        }
    }

    @Test
    fun invokeFinishesPublishesAndMarksSynced() = runBlocking {
        seedActiveWorkout()
        val published = mutableListOf<String>()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { payload ->
            published += payload.id
        }

        finishWorkout("w1")

        val workout = dao.getWorkout("w1")
        assertNotNull(workout?.endedAt)
        assertEquals(listOf("w1"), published)
        assertEquals(true, workout?.synced)
    }

    @Test
    fun invokePublishFailureStillFinishesButStaysUnsynced() = runBlocking {
        seedActiveWorkout()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { _ ->
            throw RuntimeException("network down")
        }

        finishWorkout("w1")

        val workout = dao.getWorkout("w1")
        assertNotNull(workout?.endedAt)
        assertFalse(workout?.synced ?: true)
    }

    @Test
    fun invokePublishCancellationPropagates() = runBlocking {
        seedActiveWorkout()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { _ ->
            throw CancellationException("cancelled")
        }

        assertCancellation { finishWorkout("w1") }
    }

    @Test
    fun drainUnsyncedPublishesFinishedUnsyncedWorkouts() = runBlocking {
        seedFinishedUnsynced()
        val published = mutableListOf<String>()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { payload ->
            published += payload.id
        }

        finishWorkout.drainUnsynced()

        assertEquals(listOf("w1"), published)
        assertEquals(true, dao.getWorkout("w1")?.synced)
    }

    @Test
    fun drainUnsyncedSkipsActiveWorkouts() = runBlocking {
        seedActiveWorkout()
        val published = mutableListOf<String>()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { payload ->
            published += payload.id
        }

        finishWorkout.drainUnsynced()

        assertEquals(emptyList<String>(), published)
    }

    @Test
    fun drainUnsyncedPublishesAfterPriorPublishFailure() = runBlocking {
        seedFinishedUnsynced()
        var shouldFail = true
        val published = mutableListOf<String>()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { payload ->
            if (shouldFail) throw RuntimeException("down")
            published += payload.id
        }

        finishWorkout.drainUnsynced()
        assertEquals(emptyList<String>(), published)
        assertFalse(dao.getWorkout("w1")?.synced ?: true)

        shouldFail = false
        finishWorkout.drainUnsynced()
        assertEquals(listOf("w1"), published)
        assertEquals(true, dao.getWorkout("w1")?.synced)
    }

    @Test
    fun drainUnsyncedPublishCancellationPropagates() = runBlocking {
        seedFinishedUnsynced()
        val finishWorkout = FinishWorkout(workoutRepo, syncRepo, dao) { _ ->
            throw CancellationException("cancelled")
        }

        assertCancellation { finishWorkout.drainUnsynced() }
    }
}
