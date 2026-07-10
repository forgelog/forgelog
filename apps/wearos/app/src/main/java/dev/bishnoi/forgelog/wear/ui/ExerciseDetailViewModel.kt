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
import dev.bishnoi.forgelog.wear.logic.TrackingType
import dev.bishnoi.forgelog.wear.logic.effectiveTrackingType
import dev.bishnoi.forgelog.wear.logic.resolveRestSeconds
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
    val trackingType: TrackingType = TrackingType.WEIGHT_REPS,
    val sets: List<SetRow> = emptyList(),
    val currentIndex: Int = 0,
    val restRemaining: Int? = null,
)

/**
 * Screens 2/3 per docs/wearos-scope.md: an exercise's own page, showing one
 * set at a time, with add/remove-set actions and the rest timer as a
 * transient state on this same screen (not a separate destination).
 */
class ExerciseDetailViewModel(
    private val workoutDao: WorkoutDao,
    private val referenceDao: ReferenceDao,
    private val workoutRepository: WorkoutRepository,
    private val recordsTracker: PersonalRecordsTracker,
    private val workoutExerciseId: String,
) : ViewModel() {
    private val currentIndex = MutableStateFlow(0)
    private val restRemaining = MutableStateFlow<Int?>(null)
    private var restJob: Job? = null
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
        restRemaining,
    ) { we, sets, name, index, rest ->
        latestSets = sets
        ExerciseDetailUiState(
            exerciseName = name,
            trackingType = effectiveTrackingType(we?.trackingType, null),
            sets = sets.map { it.toSetRow() },
            currentIndex = index.coerceIn(0, (sets.size - 1).coerceAtLeast(0)),
            restRemaining = rest,
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
            val improved = recordsTracker.checkAndUpdate(we.exerciseId, SetPerformance(set.weight, set.reps))
            if (improved.isNotEmpty()) prEvents.tryEmit(improved)

            startRest(resolveRestSeconds(we.restSeconds))
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

    fun skipRest() {
        restJob?.cancel()
        restRemaining.value = null
    }

    private fun startRest(seconds: Int) {
        restJob?.cancel()
        restRemaining.value = seconds
        restJob = viewModelScope.launch {
            var remaining = seconds
            while (remaining > 0) {
                delay(1000)
                remaining -= 1
                restRemaining.value = remaining
            }
            restRemaining.value = null
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
