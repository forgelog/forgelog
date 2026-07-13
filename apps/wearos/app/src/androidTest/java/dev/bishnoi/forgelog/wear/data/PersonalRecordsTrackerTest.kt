package dev.bishnoi.forgelog.wear.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SetPerformance
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

private const val PR_WEIGHT_ID = "pr-weight"
private const val BASELINE_ACHIEVED_AT = "2026-01-01T00:00:00Z"

@RunWith(AndroidJUnit4::class)
class PersonalRecordsTrackerTest {
    private lateinit var db: AppDatabase
    private lateinit var tracker: PersonalRecordsTracker

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        tracker = PersonalRecordsTracker(db.referenceDao())
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun checkAndUpdatePersistsImprovementsOverSyncedBaseline() = runBlocking {
        db.referenceDao().upsertPersonalRecords(
            listOf(
                PersonalRecordEntity(PR_WEIGHT_ID, "ex1", "max_weight", 62.5, BASELINE_ACHIEVED_AT),
            ),
        )

        val improved = tracker.checkAndUpdate("ex1", SetPerformance(weight = 70.0, reps = 8))

        assertTrue(improved.contains(RecordType.MAX_WEIGHT))
        val records = db.referenceDao().recordsForExercise("ex1").associateBy { it.recordType }
        assertEquals(PR_WEIGHT_ID, records.getValue("max_weight").id)
        assertEquals(70.0, records.getValue("max_weight").value, 0.0)
        assertEquals(560.0, records.getValue("max_volume").value, 0.0)
    }

    @Test
    fun checkAndUpdateLeavesNonImprovementsUntouched() = runBlocking {
        db.referenceDao().upsertPersonalRecords(
            listOf(
                PersonalRecordEntity(PR_WEIGHT_ID, "ex1", "max_weight", 100.0, BASELINE_ACHIEVED_AT),
                PersonalRecordEntity("pr-reps", "ex1", "max_reps", 12.0, BASELINE_ACHIEVED_AT),
                PersonalRecordEntity("pr-volume", "ex1", "max_volume", 1000.0, BASELINE_ACHIEVED_AT),
                PersonalRecordEntity("pr-e1rm", "ex1", "est_1rm", 130.0, BASELINE_ACHIEVED_AT),
            ),
        )

        val improved = tracker.checkAndUpdate("ex1", SetPerformance(weight = 90.0, reps = 8))

        assertEquals(emptyList<RecordType>(), improved)
        val records = db.referenceDao().recordsForExercise("ex1").associateBy { it.recordType }
        assertEquals(100.0, records.getValue("max_weight").value, 0.0)
        assertEquals(12.0, records.getValue("max_reps").value, 0.0)
        assertEquals(1000.0, records.getValue("max_volume").value, 0.0)
        assertEquals(130.0, records.getValue("est_1rm").value, 0.0)
    }

    @Test
    fun checkAndUpdatePersistsMissingBaselinesWithoutReportingPr() = runBlocking {
        val improved = tracker.checkAndUpdate("ex1", SetPerformance(weight = 70.0, reps = 8))

        assertEquals(emptyList<RecordType>(), improved)
        val records = db.referenceDao().recordsForExercise("ex1").associateBy { it.recordType }
        assertEquals(70.0, records.getValue("max_weight").value, 0.0)
        assertEquals(560.0, records.getValue("max_volume").value, 0.0)
    }

    @Test
    fun checkAndUpdateKeepsLocalBaselinesSilentAcrossLaterSets() = runBlocking {
        val first = tracker.checkAndUpdate("ex1", SetPerformance(weight = 70.0, reps = 8))
        val second = tracker.checkAndUpdate("ex1", SetPerformance(weight = 80.0, reps = 8))

        assertEquals(emptyList<RecordType>(), first)
        assertEquals(emptyList<RecordType>(), second)
        val records = db.referenceDao().recordsForExercise("ex1").associateBy { it.recordType }
        assertEquals(80.0, records.getValue("max_weight").value, 0.0)
        assertEquals(640.0, records.getValue("max_volume").value, 0.0)
    }
}
