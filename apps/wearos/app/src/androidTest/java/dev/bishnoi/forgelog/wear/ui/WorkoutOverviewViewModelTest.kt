package dev.bishnoi.forgelog.wear.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.ExerciseEntity
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.data.WorkoutEntity
import dev.bishnoi.forgelog.wear.data.WorkoutExerciseEntity
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class WorkoutOverviewViewModelTest {
    private lateinit var db: AppDatabase
    private lateinit var workoutRepository: WorkoutRepository
    private lateinit var finishWorkout: FinishWorkout
    private lateinit var publishDone: CountDownLatch

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        publishDone = CountDownLatch(1)
        workoutRepository = WorkoutRepository(db.workoutDao(), db.referenceDao())
        finishWorkout = FinishWorkout(
            workoutRepository,
            SyncRepository(db.referenceDao(), db.workoutDao()),
            db.workoutDao(),
        ) { publishDone.countDown() }
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seedWorkout() {
        db.referenceDao().upsertExercises(
            listOf(
                ExerciseEntity("ex1", "Bench Press", "weight_reps"),
                ExerciseEntity("ex2", "Plank", "duration"),
            ),
        )
        db.workoutDao().insertWorkout(WorkoutEntity("w1", null, "Workout", "2026-01-01T09:00:00Z", null, false))
        db.workoutDao().insertWorkoutExercise(WorkoutExerciseEntity("we1", "w1", "ex1", 0, null, "weight_reps", 60))
        db.workoutDao().insertWorkoutExercise(WorkoutExerciseEntity("we2", "w1", "ex2", 1, null, "duration", 30))
        db.workoutDao().insertLoggedSet(
            LoggedSetEntity("s1", "we1", 0, "normal", 60.0, 8, null, null, null, true, "2026-01-01T09:10:00Z"),
        )
        db.workoutDao().insertLoggedSet(
            LoggedSetEntity("s2", "we2", 0, "normal", null, null, 45, null, null, false, null),
        )
        db.workoutDao().insertLoggedSet(
            LoggedSetEntity("s3", "we2", 1, "normal", null, null, 30, null, null, true, "2026-01-01T09:12:00Z"),
        )
    }

    private fun viewModel(): WorkoutOverviewViewModel =
        WorkoutOverviewViewModel(
            workoutDao = db.workoutDao(),
            referenceDao = db.referenceDao(),
            workoutRepository = workoutRepository,
            finishWorkoutUseCase = finishWorkout,
            workoutId = "w1",
        )

    @Test
    fun exercisesReportProgressAndCurrentExercise() = runBlocking {
        seedWorkout()
        val vm = viewModel()

        val rows = withTimeout(5000) { vm.exercises.first { it.size == 2 } }

        assertEquals(ExerciseProgress("we1", "Bench Press", 1, 1, false), rows[0])
        assertEquals(ExerciseProgress("we2", "Plank", 1, 2, true), rows[1])
    }

    @Test
    fun finishWorkoutFinishesPublishesAndInvokesCallback() {
        runBlocking { seedWorkout() }
        val vm = viewModel()
        val done = CountDownLatch(1)

        vm.finishWorkout { done.countDown() }

        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertTrue(publishDone.await(5, TimeUnit.SECONDS))
        val workout = runBlocking { db.workoutDao().getWorkout("w1") }
        assertNotNull(workout?.endedAt)
        assertEquals(true, workout?.synced)
    }

    @Test
    fun discardWorkoutDeletesSessionAndInvokesCallback() {
        runBlocking { seedWorkout() }
        val vm = viewModel()
        val done = CountDownLatch(1)

        vm.discardWorkout { done.countDown() }

        assertTrue(done.await(5, TimeUnit.SECONDS))
        assertNull(runBlocking { db.workoutDao().getWorkout("w1") })
    }
}
