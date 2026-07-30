package dev.bishnoi.forgelog.wear.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearDataClientTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun publishWorkoutMailboxWritesRetrievableFixedDataItem() = runBlocking {
        val mailbox = WorkoutMailbox(
            candidate = WorkoutReplica(
                workoutId = "mailbox-test-1",
                startedAtMs = 1,
                changedAtMs = 2,
                state = WorkoutReplicaState.Discarded,
            ),
        )

        val productionRequest = WearDataClient.buildWorkoutMailboxRequest(mailbox)
        assertEquals("/workout-mailbox/watch", productionRequest.uri.path)
        putTestMailbox(mailbox)

        val items = Tasks.await(Wearable.getDataClient(context).dataItems)
        try {
            val matches = (0 until items.count)
                .map { items[it] }
                .filter { it.uri.path == TEST_WATCH_MAILBOX_PATH }
            val match = matches.single()
            val dataMap = DataMapItem.fromDataItem(match).dataMap
            val decoded = syncJson.decodeFromString(
                WorkoutMailbox.serializer(),
                dataMap.getString("payload")!!,
            )
            assertEquals(mailbox, decoded)
            assertEquals(false, dataMap.containsKey("timestamp"))
        } finally {
            items.release()
        }
    }

    @Test
    fun explicitEmptyMailboxReplacesCandidateAtTheSamePath() = runBlocking {
        putTestMailbox(
            WorkoutMailbox(
                candidate = WorkoutReplica(
                    workoutId = "mailbox-test-replaced",
                    startedAtMs = 3,
                    changedAtMs = 4,
                    state = WorkoutReplicaState.Discarded,
                ),
            ),
        )
        putTestMailbox(WorkoutMailbox())

        val items = Tasks.await(Wearable.getDataClient(context).dataItems)
        try {
            val matches = (0 until items.count)
                .map { items[it] }
                .filter { it.uri.path == TEST_WATCH_MAILBOX_PATH }
            val payload = DataMapItem.fromDataItem(matches.single()).dataMap.getString("payload")!!
            assertEquals(WorkoutMailbox(), decodeWorkoutMailboxPayload(payload))
        } finally {
            items.release()
        }
    }

    @Test
    fun getPhoneWorkoutMailboxReadsOnlyTheExactPeerPath() = runBlocking {
        val payload = """{"protocol_version":1,"candidate":null,"watch_receipt":null}"""
        val request = PutDataMapRequest.create("/workout-mailbox/phone").apply {
            dataMap.putString("payload", payload)
        }.asPutDataRequest().setUrgent()
        Tasks.await(Wearable.getDataClient(context).putDataItem(request))

        assertEquals(payload, WearDataClient.getPhoneWorkoutMailbox(context))
    }

    private fun putTestMailbox(mailbox: WorkoutMailbox) {
        Tasks.await(
            Wearable.getDataClient(context).putDataItem(
                WearDataClient.buildWorkoutMailboxRequest(mailbox, TEST_WATCH_MAILBOX_PATH),
            ),
        )
    }

    companion object {
        // The app coordinator owns the production path and may republish it during this suite.
        private const val TEST_WATCH_MAILBOX_PATH = "/workout-mailbox/watch-test"
    }
}
