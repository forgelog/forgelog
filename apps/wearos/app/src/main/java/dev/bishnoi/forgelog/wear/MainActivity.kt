package dev.bishnoi.forgelog.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import dev.bishnoi.forgelog.wear.ui.ForgeLogNavHost
import androidx.lifecycle.lifecycleScope
import dev.bishnoi.forgelog.wear.data.WearStoreProvider
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutSyncClient
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import android.util.Log
import dev.bishnoi.forgelog.wear.sync.WearDataClient
import kotlinx.coroutines.CancellationException

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val stores = WearStoreProvider.get(applicationContext)
        lifecycleScope.launch {
            ActiveWorkoutSyncClient.drainPersistent(applicationContext, stores.workouts)
        }
        lifecycleScope.launch {
            stores.workouts.state
                .map { it.pendingMutations }
                .distinctUntilChanged()
                .collect {
                    try {
                        WearDataClient.publishPendingMutations(applicationContext, stores.workouts)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        Log.w("ActiveWorkoutSync", "Pending mutations remain durable", error)
                    }
                }
        }
        setContent { ForgeLogNavHost() }
    }
}
