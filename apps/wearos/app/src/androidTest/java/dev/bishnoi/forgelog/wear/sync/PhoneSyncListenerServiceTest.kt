package dev.bishnoi.forgelog.wear.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.bishnoi.forgelog.wear.data.WearStoreProvider
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
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
    fun clearReferenceState() {
        runBlocking {
            val stores = WearStoreProvider.get(context)
            stores.references.clearRecoverableCache()
            stores.workouts.currentActiveWorkout()?.let { stores.workouts.discardWorkout(it.id) }
            stores.workouts.pendingUploads.first().forEach { stores.workouts.acknowledgeWorkout(it.payload.id) }
        }
    }

    @Test
    fun publishingSyncSnapshotDataItemPopulatesReferenceTables() {
        val json = """
            {"protocol_version":2,"routines":[{"id":"itr1","name":"Instrumented Routine","position":0,"exercises":[]}],"personalRecords":[],"profile":{"name":"Jordan","sex":null,"birth_date":null,"height_cm":null,"bodyweight_kg":null}}
        """.trimIndent()

        val request = PutDataMapRequest.create("/sync-snapshot").apply {
            dataMap.putString("payload", json)
        }.asPutDataRequest().setUrgent()

        Tasks.await(Wearable.getDataClient(context).putDataItem(request))

        val references = WearStoreProvider.get(context).references
        var found = false
        repeat(50) {
            val routines = runBlocking { references.routines.first() }
            if (routines.any { it.name == "Instrumented Routine" }) {
                found = true
                return@repeat
            }
            Thread.sleep(200)
        }

        assertTrue("expected the synced routine to appear in JSON state within 10s", found)
    }

    @Test
    fun malformedSyncSnapshotPayloadIsRejectedWithoutPartialReferenceWrites() = runBlocking {
        val references = WearStoreProvider.get(context).references
        val payload = InstrumentationRegistry.getInstrumentation().context.assets
            .open("malformed-sync-snapshot.json")
            .bufferedReader()
            .use { it.readText() }

        val applied = applySyncSnapshotPayload(payload, references)

        assertFalse(applied)
        assertEquals(emptyList<String>(), references.routines.first().map { it.name })
    }

    @Test
    fun workoutAcknowledgementDataItemRemovesPendingUpload() = runBlocking {
        val stores = WearStoreProvider.get(context)
        val payload = InstrumentationRegistry.getInstrumentation().context.assets
            .open("sync-snapshot.json")
            .bufferedReader()
            .use { it.readText() }
        assertTrue(applySyncSnapshotPayload(payload, stores.references))
        val workout = stores.workouts.startWorkout("r1")
        stores.workouts.finishWorkout(workout.id)

        val request = PutDataMapRequest.create("/workout-ack/${workout.id}").apply {
            dataMap.putString("workout_id", workout.id)
            dataMap.putLong("timestamp", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Tasks.await(Wearable.getDataClient(context).putDataItem(request))

        var acknowledged = false
        repeat(50) {
            if (stores.workouts.pendingUploads.first().none { it.payload.id == workout.id }) {
                acknowledged = true
                return@repeat
            }
            Thread.sleep(200)
        }

        assertTrue("expected the workout acknowledgement to clear the JSON outbox", acknowledged)
    }
}
