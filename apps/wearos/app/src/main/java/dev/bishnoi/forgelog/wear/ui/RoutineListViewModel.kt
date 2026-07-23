package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.ReferenceRepository
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.data.WorkoutStorageStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class SyncRequestState { IDLE, SENDING, SENT, FAILED }

data class RoutineListItem(val id: String, val name: String, val exerciseCount: Int)
data class ActiveWorkoutListItem(val id: String, val name: String, val startedAt: String)

class RoutineListViewModel(
    private val references: ReferenceRepository,
    workouts: WorkoutRepository,
    private val syncWithPhone: suspend () -> Boolean,
) : ViewModel() {
    val routines: StateFlow<List<RoutineListItem>> = references.routines
        .map { list -> list.map { RoutineListItem(it.id, it.name, it.exercises.size) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val activeWorkout: StateFlow<ActiveWorkoutListItem?> = workouts.activeWorkout
        .map { workout -> workout?.let { ActiveWorkoutListItem(it.id, it.name, it.startedAt) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val workoutStorageError: StateFlow<Boolean> = workouts.storageStatus
        .map { it == WorkoutStorageStatus.UNAVAILABLE }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _syncRequestState = MutableStateFlow(SyncRequestState.IDLE)
    val syncRequestState: StateFlow<SyncRequestState> = _syncRequestState.asStateFlow()

    fun requestSync() {
        viewModelScope.launch {
            performSyncRequest()
        }
    }

    fun requestSyncIfNeeded() {
        viewModelScope.launch {
            if (references.state.first().snapshot == null) performSyncRequest()
        }
    }

    private suspend fun performSyncRequest() {
        _syncRequestState.value = SyncRequestState.SENDING
        val sent = try { syncWithPhone() } catch (_: Exception) { false }
        _syncRequestState.value = if (sent) SyncRequestState.SENT else SyncRequestState.FAILED
    }
}
