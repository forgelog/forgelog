package dev.bishnoi.forgelog.wear.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import dev.bishnoi.forgelog.wear.sync.WearDataClient
import dev.bishnoi.forgelog.wear.sync.WorkoutMailboxSyncCoordinator
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.map

class WearStoreProvider private constructor(context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val directory = File(context.applicationContext.filesDir, "datastore").apply { mkdirs() }

    private val referenceStore = DataStoreFactory.create(
        serializer = ReferenceStateSerializer,
        corruptionHandler = ReplaceFileCorruptionHandler { error ->
            Log.w(TAG, "Resetting corrupt phone-owned reference state", error)
            ReferenceState()
        },
        scope = scope,
        produceFile = { File(directory, "reference-state.json") },
    )
    private val workoutStore = DataStoreFactory.create(
        serializer = WorkoutStateSerializer,
        corruptionHandler = ReplaceFileCorruptionHandler { error ->
            Log.w(TAG, "Resetting incompatible workout state for mailbox cutover", error)
            WorkoutState()
        },
        scope = scope,
        produceFile = { File(directory, "workout-state.json") },
    )

    val references = ReferenceRepository(referenceStore)
    val workouts = WorkoutRepository(workoutStore, references)
    val workoutMailboxSync = WorkoutMailboxSyncCoordinator(
        desiredMailboxes = workouts.state.map { it.desiredMailbox },
        applyMailbox = workouts::applyPhoneMailbox,
        readPeerMailbox = { WearDataClient.getPhoneWorkoutMailbox(context.applicationContext) },
        publishMailbox = { mailbox ->
            WearDataClient.publishWorkoutMailbox(context.applicationContext, mailbox)
        },
        logWarning = { message, error -> Log.w(TAG, message, error) },
    ).also { it.start(scope) }

    companion object {
        private const val TAG = "WearStoreProvider"

        @Volatile
        private var instance: WearStoreProvider? = null

        fun get(context: Context): WearStoreProvider = instance ?: synchronized(this) {
            instance ?: WearStoreProvider(context).also { instance = it }
        }
    }
}
