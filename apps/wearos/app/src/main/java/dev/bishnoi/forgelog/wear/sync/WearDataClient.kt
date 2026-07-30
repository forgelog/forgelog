package dev.bishnoi.forgelog.wear.sync

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

private const val PAYLOAD_KEY = "payload"
private const val PUBLISH_TIMEOUT_SECONDS = 30L
private const val PHONE_WORKOUT_MAILBOX_PATH = "/workout-mailbox/phone"
private const val WATCH_WORKOUT_MAILBOX_PATH = "/workout-mailbox/watch"

val syncJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    classDiscriminator = "kind"
}

object WearDataClient {
    suspend fun publishWorkoutMailbox(context: Context, mailbox: WorkoutMailbox) {
        val request = buildWorkoutMailboxRequest(mailbox)
        withContext(Dispatchers.IO) {
            Tasks.await(
                Wearable.getDataClient(context).putDataItem(request),
                PUBLISH_TIMEOUT_SECONDS,
                TimeUnit.SECONDS,
            )
        }
    }

    suspend fun getPhoneWorkoutMailbox(context: Context): String? = withContext(Dispatchers.IO) {
        val items = Tasks.await(
            Wearable.getDataClient(context).dataItems,
            PUBLISH_TIMEOUT_SECONDS,
            TimeUnit.SECONDS,
        )
        try {
            (0 until items.count)
                .asSequence()
                .map { items[it] }
                .firstOrNull { it.uri.path == PHONE_WORKOUT_MAILBOX_PATH }
                ?.let { DataMapItem.fromDataItem(it).dataMap.getString(PAYLOAD_KEY) }
        } finally {
            items.release()
        }
    }

    internal fun buildWorkoutMailboxRequest(
        mailbox: WorkoutMailbox,
        path: String = WATCH_WORKOUT_MAILBOX_PATH,
    ): PutDataRequest =
        PutDataMapRequest.create(path).apply {
            dataMap.putString(
                PAYLOAD_KEY,
                syncJson.encodeToString(WorkoutMailbox.serializer(), mailbox),
            )
        }.asPutDataRequest().setUrgent()
}
