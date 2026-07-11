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
    fun checkAndUpdate_persists_improvements_over_synced_baseline() = runBlocking {
        db.referenceDao().upsertPersonalRecords(
            listOf(
                PersonalRecordEntity("pr-weight", "ex1", "max_weight", 62.5, "2026-01-01T00:00:00Z"),
            ),
        )

        val improved = tracker.checkAndUpdate("ex1", SetPerformance(weight = 70.0, reps = 8))

        assertTrue(improved.contains(RecordType.MAX_WEIGHT))
        val records = db.referenceDao().recordsForExercise("ex1").associateBy { it.recordType }
        assertEquals("pr-weight", records.getValue("max_weight").id)
        assertEquals(70.0, records.getValue("max_weight").value, 0.0)
        assertEquals(560.0, records.getValue("max_volume").value, 0.0)
    }

    @Test
    fun checkAndUpdate_leaves_non_improvements_untouched() = runBlocking {
        db.referenceDao().upsertPersonalRecords(
            listOf(
                PersonalRecordEntity("pr-weight", "ex1", "max_weight", 100.0, "2026-01-01T00:00:00Z"),
                PersonalRecordEntity("pr-reps", "ex1", "max_reps", 12.0, "2026-01-01T00:00:00Z"),
                PersonalRecordEntity("pr-volume", "ex1", "max_volume", 1000.0, "2026-01-01T00:00:00Z"),
                PersonalRecordEntity("pr-e1rm", "ex1", "est_1rm", 130.0, "2026-01-01T00:00:00Z"),
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
}
