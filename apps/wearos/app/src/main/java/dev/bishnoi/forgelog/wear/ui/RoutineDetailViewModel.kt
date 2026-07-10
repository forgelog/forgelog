package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.ReferenceDao
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RoutineExercisePreview(val name: String, val setCount: Int)

data class RoutineDetailUiState(
    val name: String = "",
    val exercises: List<RoutineExercisePreview> = emptyList(),
)

/** Routine screen (issue #28 "Routine"): preview a routine, then start its workout. */
class RoutineDetailViewModel(
    private val referenceDao: ReferenceDao,
    private val workoutRepository: WorkoutRepository,
    private val routineId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(RoutineDetailUiState())
    val uiState: StateFlow<RoutineDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val routine = referenceDao.routine(routineId)
            val exercises = referenceDao.routineExercises(routineId).map { re ->
                val name = referenceDao.exercise(re.exerciseId)?.name ?: re.exerciseId
                RoutineExercisePreview(name, referenceDao.routineSets(re.id).size)
            }
            _uiState.value = RoutineDetailUiState(name = routine?.name ?: "Routine", exercises = exercises)
        }
    }

    fun startWorkout(onStarted: (workoutId: String) -> Unit) {
        viewModelScope.launch {
            val workout = workoutRepository.startWorkout(routineId)
            onStarted(workout.id)
        }
    }
}
