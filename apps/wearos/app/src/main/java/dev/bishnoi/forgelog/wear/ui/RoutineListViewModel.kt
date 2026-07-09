package dev.bishnoi.forgelog.wear.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.RoutineEntity
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRequestClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class SyncRequestState { IDLE, SENDING, SENT, FAILED }

/** Screen 1 per docs/wearos-scope.md: pick a routine to start a workout. */
class RoutineListViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.get(application)
    private val workoutRepository = WorkoutRepository(db.workoutDao(), db.referenceDao())

    val routines: StateFlow<List<RoutineEntity>> = db.referenceDao()
        .observeRoutines()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _syncRequestState = MutableStateFlow(SyncRequestState.IDLE)
    val syncRequestState: StateFlow<SyncRequestState> = _syncRequestState.asStateFlow()

    fun startWorkout(routineId: String, onStarted: (workoutId: String) -> Unit) {
        viewModelScope.launch {
            val workout = workoutRepository.startWorkout(routineId)
            onStarted(workout.id)
        }
    }

    fun requestSync() {
        viewModelScope.launch {
            _syncRequestState.value = SyncRequestState.SENDING
            val sent = SyncRequestClient.requestSync(getApplication())
            _syncRequestState.value = if (sent) SyncRequestState.SENT else SyncRequestState.FAILED
        }
    }
}
