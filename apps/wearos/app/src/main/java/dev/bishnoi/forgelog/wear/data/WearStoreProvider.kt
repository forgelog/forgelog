package dev.bishnoi.forgelog.wear.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

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
        scope = scope,
        produceFile = { File(directory, "workout-state.json") },
    )

    val references = ReferenceRepository(referenceStore)
    val workouts = WorkoutRepository(workoutStore, references)

    companion object {
        private const val TAG = "WearStoreProvider"

        @Volatile
        private var instance: WearStoreProvider? = null

        fun get(context: Context): WearStoreProvider = instance ?: synchronized(this) {
            instance ?: WearStoreProvider(context).also { instance = it }
        }
    }
}
