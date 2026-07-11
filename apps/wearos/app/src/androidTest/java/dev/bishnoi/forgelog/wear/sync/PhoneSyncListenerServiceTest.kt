package dev.bishnoi.forgelog.wear.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.bishnoi.forgelog.wear.data.AppDatabase
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Publishing a DataItem also delivers onDataChanged to listener services on
 * the SAME node (not just remote ones) — this exercises the real
 * PhoneSyncListenerService -> SyncRepository.applySnapshot path without
 * needing a real Bluetooth-paired phone, which isn't available in this
 * environment (needs Android Studio's Device Manager pairing wizard).
 */
@RunWith(AndroidJUnit4::class)
class PhoneSyncListenerServiceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    fun clearDb() {
        runBlocking { AppDatabase.get(context).clearAllTables() }
    }

    @Test
    fun publishingASyncSnapshotDataItem_populatesReferenceTables() {
        val json = """
            {"routines":[{"id":"itr1","name":"Instrumented Routine","position":0,"exercises":[]}],"personalRecords":[]}
        """.trimIndent()

        val request = PutDataMapRequest.create("/sync-snapshot").apply {
            dataMap.putString("payload", json)
        }.asPutDataRequest().setUrgent()

        Tasks.await(Wearable.getDataClient(context).putDataItem(request))

        val db = AppDatabase.get(context)
        var found = false
        repeat(50) {
            val routines = runBlocking { db.referenceDao().getRoutines() }
            if (routines.any { it.name == "Instrumented Routine" }) {
                found = true
                return@repeat
            }
            Thread.sleep(200)
        }

        assertTrue("expected the synced routine to appear in Room within 10s", found)
    }

    @Test
    fun malformedSyncSnapshotPayload_isRejectedWithoutPartialReferenceWrites() = runBlocking {
        val db = AppDatabase.get(context)
        val payload = InstrumentationRegistry.getInstrumentation().context.assets
            .open("malformed-sync-snapshot.json")
            .bufferedReader()
            .use { it.readText() }

        val applied = applySyncSnapshotPayload(payload, db)

        assertFalse(applied)
        assertEquals(emptyList<String>(), db.referenceDao().getRoutines().map { it.name })
    }
}
