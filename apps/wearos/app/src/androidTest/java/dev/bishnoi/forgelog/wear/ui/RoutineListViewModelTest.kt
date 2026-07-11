package dev.bishnoi.forgelog.wear.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.ExerciseEntity
import dev.bishnoi.forgelog.wear.data.RoutineEntity
import dev.bishnoi.forgelog.wear.data.RoutineExerciseEntity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class RoutineListViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

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
    fun routinesIncludeExerciseCounts() = runTest(mainDispatcherRule.dispatcher) {
        db.referenceDao().upsertExercises(listOf(ExerciseEntity("ex1", "Bench Press", "weight_reps")))
        db.referenceDao().upsertRoutines(listOf(RoutineEntity("r1", "Push Day", 0)))
        db.referenceDao().upsertRoutineExercises(
            listOf(
                RoutineExerciseEntity("re1", "r1", "ex1", 0, null, 90, null),
                RoutineExerciseEntity("re2", "r1", "ex1", 1, null, 90, null),
            ),
        )

        val vm = RoutineListViewModel(db.referenceDao()) { true }

        val item = vm.routines.first { it.isNotEmpty() }.single()
        assertEquals(RoutineListItem("r1", "Push Day", 2), item)
    }

    @Test
    fun requestSyncTransitionsIdleSendingSent() = runTest(mainDispatcherRule.dispatcher) {
        val syncResult = CompletableDeferred<Boolean>()
        val vm = RoutineListViewModel(db.referenceDao()) { syncResult.await() }

        assertEquals(SyncRequestState.IDLE, vm.syncRequestState.value)

        vm.requestSync()
        runCurrent()

        assertEquals(SyncRequestState.SENDING, vm.syncRequestState.value)

        syncResult.complete(true)
        advanceUntilIdle()

        assertEquals(SyncRequestState.SENT, vm.syncRequestState.value)
    }

    @Test
    fun requestSyncTransitionsToFailedWhenPhoneRequestFails() = runTest(mainDispatcherRule.dispatcher) {
        val vm = RoutineListViewModel(db.referenceDao()) { false }

        vm.requestSync()
        advanceUntilIdle()

        assertEquals(SyncRequestState.FAILED, vm.syncRequestState.value)
    }
}
