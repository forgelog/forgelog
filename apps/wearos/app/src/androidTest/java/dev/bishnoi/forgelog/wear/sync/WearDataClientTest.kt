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

/** Verifies the outbox DataItem WearDataClient.publishWorkout produces is retrievable and well-formed. */
@RunWith(AndroidJUnit4::class)
class WearDataClientTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun publishWorkoutWritesRetrievableDataItem() = runBlocking {
        val payload = WorkoutPayloadDto(
            id = "outbox-test-1",
            routineId = null,
            name = "Freestyle",
            startedAt = "2026-07-07T00:00:00.000Z",
            endedAt = null,
            exercises = emptyList(),
        )

        WearDataClient.publishWorkout(context, payload)

        val items = Tasks.await(Wearable.getDataClient(context).dataItems)
        try {
            val match = (0 until items.count)
                .map { items[it] }
                .firstOrNull { it.uri.path == "/workout/outbox-test-1" }
            requireNotNull(match) { "expected a DataItem at /workout/outbox-test-1" }

            val dataMap = DataMapItem.fromDataItem(match).dataMap
            val decoded = syncJson.decodeFromString(WorkoutPayloadDto.serializer(), dataMap.getString("payload")!!)
            assertEquals(payload, decoded)
        } finally {
            items.release()
        }
    }

    @Test
    fun cleanupWorkoutDeletesPayloadAndAcknowledgementDataItems() = runBlocking {
        val workoutId = "cleanup-${System.nanoTime()}"
        val payload = WorkoutPayloadDto(
            id = workoutId,
            routineId = null,
            name = "Cleanup",
            startedAt = "2026-07-07T00:00:00.000Z",
            endedAt = null,
            exercises = emptyList(),
        )
        WearDataClient.publishWorkout(context, payload)
        val acknowledgement = PutDataMapRequest.create("/workout-ack/$workoutId").apply {
            dataMap.putString("workout_id", workoutId)
        }.asPutDataRequest().setUrgent()
        Tasks.await(Wearable.getDataClient(context).putDataItem(acknowledgement))

        WearDataClient.cleanupWorkout(context, workoutId)

        val items = Tasks.await(Wearable.getDataClient(context).dataItems)
        try {
            val paths = (0 until items.count).map { items[it].uri.path }
            assertEquals(false, "/workout/$workoutId" in paths)
            assertEquals(false, "/workout-ack/$workoutId" in paths)
        } finally {
            items.release()
        }
    }
}
