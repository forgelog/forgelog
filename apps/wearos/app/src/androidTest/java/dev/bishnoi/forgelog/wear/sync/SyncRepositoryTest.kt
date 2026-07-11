package dev.bishnoi.forgelog.wear.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.bishnoi.forgelog.wear.data.AppDatabase
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncRepositoryTest {
    private lateinit var db: AppDatabase
    private lateinit var repo: SyncRepository

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        repo = SyncRepository(db.referenceDao(), db.workoutDao())
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun applySnapshot_populates_reference_tables_and_is_idempotent() = runBlocking {
        val snapshot = syncJson.decodeFromString(SyncSnapshot.serializer(), fixtureText("sync-snapshot.json"))

        repo.applySnapshot(snapshot)
        val firstState = referenceState()

        repo.applySnapshot(snapshot)

        assertEquals(firstState, referenceState())
        assertEquals(listOf("Push Day"), firstState.routineNames)
        assertEquals(listOf("ex1"), firstState.exerciseIds)
        assertEquals(listOf("rs1"), firstState.routineSetIds)
        assertEquals(listOf("max_weight"), firstState.personalRecordTypes)
        assertEquals(listOf(90), firstState.routineExerciseRestSeconds)
        assertEquals(listOf(60.0), firstState.routineSetTargetWeights)
        assertEquals(listOf(62.5), firstState.personalRecordValues)
    }

    private suspend fun referenceState(): ReferenceState {
        val referenceDao = db.referenceDao()
        val routines = referenceDao.getRoutines()
        val routineExercises = routines.flatMap { referenceDao.routineExercises(it.id) }
        val routineSets = routineExercises.flatMap { referenceDao.routineSets(it.id) }
        val exerciseIds = routineExercises.map { it.exerciseId }.mapNotNull { referenceDao.exercise(it)?.id }
        val recordTypes = referenceDao.recordsForExercise("ex1").map { it.recordType }
        return ReferenceState(
            routineNames = routines.map { it.name },
            routineExerciseIds = routineExercises.map { it.id },
            exerciseIds = exerciseIds,
            routineSetIds = routineSets.map { it.id },
            personalRecordTypes = recordTypes,
            routineExerciseRestSeconds = routineExercises.map { it.restSeconds },
            routineSetTargetWeights = routineSets.map { it.targetWeight },
            personalRecordValues = referenceDao.recordsForExercise("ex1").map { it.value },
        )
    }

    private fun fixtureText(name: String): String =
        InstrumentationRegistry.getInstrumentation().context.assets.open(name).bufferedReader().use { it.readText() }

    private data class ReferenceState(
        val routineNames: List<String>,
        val routineExerciseIds: List<String>,
        val exerciseIds: List<String>,
        val routineSetIds: List<String>,
        val personalRecordTypes: List<String>,
        val routineExerciseRestSeconds: List<Int?>,
        val routineSetTargetWeights: List<Double?>,
        val personalRecordValues: List<Double>,
    )
}
