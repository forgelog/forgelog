package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.data.PersonalRecordsTracker
import dev.bishnoi.forgelog.wear.data.ReferenceDao
import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SetPerformance
import dev.bishnoi.forgelog.wear.logic.ExerciseType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.MutableSharedFlow
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

/**
 * Screens 2/3 per docs/wearos-scope.md: an exercise's own page, showing one
 * set at a time, with add/remove-set actions.
 */
class ExerciseDetailViewModel(
    private val workoutDao: WorkoutDao,
    private val referenceDao: ReferenceDao,
    private val workoutRepository: WorkoutRepository,
    private val recordsTracker: PersonalRecordsTracker,
    private val workoutExerciseId: String,
) : ViewModel() {
    private val currentIndex = MutableStateFlow(0)
    private var latestSets: List<LoggedSetEntity> = emptyList()

    private val prEvents = MutableSharedFlow<List<RecordType>>(extraBufferCapacity = 1)
    val prEvent: SharedFlow<List<RecordType>> = prEvents.asSharedFlow()

    private val workoutExerciseFlow = workoutDao.observeWorkoutExerciseById(workoutExerciseId)
    private val setsFlow = workoutDao.observeLoggedSets(workoutExerciseId)
    private val exerciseNameFlow = workoutExerciseFlow.map { we ->
        we?.let { referenceDao.exercise(it.exerciseId)?.name } ?: ""
    }

    val uiState: StateFlow<ExerciseDetailUiState> = combine(
        workoutExerciseFlow,
        setsFlow,
        exerciseNameFlow,
        currentIndex,
    ) { we, sets, name, index ->
        latestSets = sets
        ExerciseDetailUiState(
            exerciseName = name,
            exerciseType = we?.let { ExerciseType.fromValue(it.exerciseType) } ?: ExerciseType.WEIGHT_REPS,
            sets = sets.map { it.toSetRow() },
            currentIndex = index.coerceIn(0, (sets.size - 1).coerceAtLeast(0)),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ExerciseDetailUiState())

    fun nextSet() {
        currentIndex.value += 1
    }

    fun prevSet() {
        currentIndex.value = (currentIndex.value - 1).coerceAtLeast(0)
    }

    fun updateValues(setId: String, weight: Double?, reps: Int?) {
        val set = latestSets.find { it.id == setId } ?: return
        viewModelScope.launch { workoutRepository.updateSetValues(set, weight, reps) }
    }

    fun updateDuration(setId: String, durationSeconds: Int?) {
        val set = latestSets.find { it.id == setId } ?: return
        viewModelScope.launch { workoutRepository.updateSetDuration(set, durationSeconds) }
    }

    fun updateDistance(setId: String, distanceMeters: Double?) {
        val set = latestSets.find { it.id == setId } ?: return
        viewModelScope.launch { workoutRepository.updateSetDistance(set, distanceMeters) }
    }

    fun markDone(setId: String) {
        val set = latestSets.find { it.id == setId } ?: return
        viewModelScope.launch {
            workoutRepository.markSetCompleted(set, true)

            val we = workoutDao.getWorkoutExercise(workoutExerciseId) ?: return@launch
            val completedSet = workoutDao.loggedSet(setId) ?: return@launch
            val exerciseType = ExerciseType.fromValue(we.exerciseType) ?: ExerciseType.WEIGHT_REPS
            val improved = recordsTracker.checkAndUpdate(
                we.exerciseId,
                SetPerformance(completedSet.weight, completedSet.reps, exerciseType, completedSet.setType),
            )
            if (improved.isNotEmpty()) prEvents.tryEmit(improved)
        }
    }

    fun addSet() {
        viewModelScope.launch { workoutRepository.addSet(workoutExerciseId) }
    }

    fun removeSet(setId: String) {
        viewModelScope.launch { workoutRepository.removeSet(setId) }
    }

    fun cycleSetType(setId: String) {
        val set = latestSets.find { it.id == setId } ?: return
        viewModelScope.launch { workoutRepository.cycleSetType(set) }
    }

    fun deleteExercise(onDone: () -> Unit) {
        viewModelScope.launch {
            workoutRepository.deleteExercise(workoutExerciseId)
            onDone()
        }
    }

}

private fun LoggedSetEntity.toSetRow() = SetRow(
    id = id,
    setType = setType,
    weight = weight,
    reps = reps,
    durationSeconds = durationSeconds,
    distanceMeters = distanceMeters,
    completed = completed,
)
