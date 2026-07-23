package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.ReferenceRepository
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.data.WorkoutStorageStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RoutineExercisePreview(val name: String, val setCount: Int)

data class RoutineDetailUiState(
    val name: String = "",
    val exercises: List<RoutineExercisePreview> = emptyList(),
    val workoutStorageError: Boolean = false,
)

class RoutineDetailViewModel(
    private val references: ReferenceRepository,
    private val workouts: WorkoutRepository,
    private val routineId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RoutineDetailUiState())
    val uiState: StateFlow<RoutineDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val routine = references.currentRoutine(routineId)
            _uiState.update {
                it.copy(
                    name = routine?.name ?: "Routine",
                    exercises = routine?.exercises.orEmpty().sortedBy { exercise -> exercise.position }.map { exercise ->
                        RoutineExercisePreview(exercise.exercise.name, exercise.sets.size)
                    },
                )
            }
        }
        viewModelScope.launch {
            workouts.storageStatus.collect { status ->
                _uiState.update { it.copy(workoutStorageError = status == WorkoutStorageStatus.UNAVAILABLE) }
            }
        }
    }

    fun startWorkout(onStarted: (workoutId: String) -> Unit) {
        if (_uiState.value.workoutStorageError) return
        viewModelScope.launch {
            try {
                onStarted(workouts.startOrResumeWorkout(routineId).id)
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                _uiState.update { it.copy(workoutStorageError = true) }
            }
        }
    }
}
