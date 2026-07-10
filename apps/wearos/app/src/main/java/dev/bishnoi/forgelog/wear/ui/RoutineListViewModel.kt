package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.ReferenceDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

enum class SyncRequestState { IDLE, SENDING, SENT, FAILED }

data class RoutineListItem(val id: String, val name: String, val exerciseCount: Int)

/** Home screen (issue #28 "Home / Start"): the synced routines to choose from. */
class RoutineListViewModel(
    private val referenceDao: ReferenceDao,
    private val syncWithPhone: suspend () -> Boolean,
) : ViewModel() {
    val routines: StateFlow<List<RoutineListItem>> = referenceDao
        .observeRoutines()
        .map { list ->
            list.map { RoutineListItem(it.id, it.name, referenceDao.routineExerciseCount(it.id)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _syncRequestState = MutableStateFlow(SyncRequestState.IDLE)
    val syncRequestState: StateFlow<SyncRequestState> = _syncRequestState.asStateFlow()

    fun requestSync() {
        viewModelScope.launch {
            _syncRequestState.value = SyncRequestState.SENDING
            val sent = try { syncWithPhone() } catch (_: Exception) { false }
            _syncRequestState.value = if (sent) SyncRequestState.SENT else SyncRequestState.FAILED
        }
    }
}
