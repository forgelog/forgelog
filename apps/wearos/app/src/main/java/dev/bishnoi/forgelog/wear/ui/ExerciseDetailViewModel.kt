package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.ActiveLoggedSet
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.logic.ExerciseType
import dev.bishnoi.forgelog.wear.logic.RecordType
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SetRow(
    val id: String,
    val setType: String,
    val weight: Double?,
    val reps: Int?,
    val durationSeconds: Int?,
    val distanceMeters: Double?,
    val completed: Boolean,
)

data class ExerciseDetailUiState(
    val exerciseName: String = "",
    val exerciseType: ExerciseType = ExerciseType.WEIGHT_REPS,
    val sets: List<SetRow> = emptyList(),
    val currentIndex: Int = 0,
)

class ExerciseDetailViewModel(
    private val workouts: WorkoutRepository,
    private val workoutExerciseId: String,
) : ViewModel() {
    private val currentIndex = MutableStateFlow(0)
    private var latestSets: List<ActiveLoggedSet> = emptyList()

    private val prEvents = MutableSharedFlow<List<RecordType>>(extraBufferCapacity = 1)
    val prEvent: SharedFlow<List<RecordType>> = prEvents.asSharedFlow()

    private val exerciseFlow = workouts.activeWorkout.map { workout ->
        workout?.exercises?.firstOrNull { it.id == workoutExerciseId }
    }

    val uiState: StateFlow<ExerciseDetailUiState> = combine(exerciseFlow, currentIndex) { exercise, index ->
        val sets = exercise?.sets.orEmpty().sortedBy { it.position }
        latestSets = sets
        ExerciseDetailUiState(
            exerciseName = exercise?.exerciseName.orEmpty(),
            exerciseType = exercise?.let { ExerciseType.fromValue(it.exerciseType) } ?: ExerciseType.WEIGHT_REPS,
            sets = sets.map { it.toSetRow() },
            currentIndex = index.coerceIn(0, (sets.size - 1).coerceAtLeast(0)),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ExerciseDetailUiState())

    fun nextSet() { currentIndex.value += 1 }
    fun prevSet() { currentIndex.value = (currentIndex.value - 1).coerceAtLeast(0) }

    fun updateValues(setId: String, weight: Double?, reps: Int?) {
        if (latestSets.none { it.id == setId }) return
        viewModelScope.launch { workouts.updateSetValues(setId, weight, reps) }
    }

    fun updateDuration(setId: String, durationSeconds: Int?) {
        if (latestSets.none { it.id == setId }) return
        viewModelScope.launch { workouts.updateSetDuration(setId, durationSeconds) }
    }

    fun updateDistance(setId: String, distanceMeters: Double?) {
        if (latestSets.none { it.id == setId }) return
        viewModelScope.launch { workouts.updateSetDistance(setId, distanceMeters) }
    }

    fun markDone(setId: String) {
        if (latestSets.none { it.id == setId }) return
        viewModelScope.launch {
            val improved = workouts.markSetCompleted(setId, true)
            if (improved.isNotEmpty()) prEvents.emit(improved)
        }
    }

    fun addSet() { viewModelScope.launch { workouts.addSet(workoutExerciseId) } }
    fun removeSet(setId: String) { viewModelScope.launch { workouts.removeSet(setId) } }
    fun cycleSetType(setId: String) { viewModelScope.launch { workouts.cycleSetType(setId) } }

    fun deleteExercise(onDone: () -> Unit) {
        viewModelScope.launch {
            workouts.deleteExercise(workoutExerciseId)
            onDone()
        }
    }
}

private fun ActiveLoggedSet.toSetRow() = SetRow(
    id = id,
    setType = setType,
    weight = weight,
    reps = reps,
    durationSeconds = durationSeconds,
    distanceMeters = distanceMeters,
    completed = completed,
)
