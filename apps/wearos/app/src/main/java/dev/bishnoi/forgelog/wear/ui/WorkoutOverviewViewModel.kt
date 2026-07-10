package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.ReferenceDao
import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

data class ExerciseProgress(
    val workoutExerciseId: String,
    val name: String,
    val completedSets: Int,
    val totalSets: Int,
    val isCurrent: Boolean,
) {
    val isDone: Boolean get() = totalSets > 0 && completedSets >= totalSets
}

/** Active Workout overview (issue #28 screen 3): per-exercise progress + finish/discard. */
class WorkoutOverviewViewModel(
    private val workoutDao: WorkoutDao,
    private val referenceDao: ReferenceDao,
    private val workoutRepository: WorkoutRepository,
    private val finishWorkoutUseCase: FinishWorkout,
    private val workoutId: String,
) : ViewModel() {
    private val nameCache = mutableMapOf<String, String>()

    val exercises: StateFlow<List<ExerciseProgress>> = combine(
        workoutDao.observeWorkoutExercises(workoutId),
        workoutDao.observeLoggedSetsForWorkout(workoutId),
    ) { workoutExercises, sets ->
        val setsByExercise = sets.groupBy { it.workoutExerciseId }
        val rows = workoutExercises.map { we ->
            val exerciseSets = setsByExercise[we.id].orEmpty()
            val name = nameCache.getOrPut(we.exerciseId) {
                referenceDao.exercise(we.exerciseId)?.name ?: we.exerciseId
            }
            ExerciseProgress(
                workoutExerciseId = we.id,
                name = name,
                completedSets = exerciseSets.count { it.completed },
                totalSets = exerciseSets.size,
                isCurrent = false,
            )
        }
        val currentIndex = rows.indexOfFirst { !it.isDone }
        rows.mapIndexed { index, row -> row.copy(isCurrent = index == currentIndex) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val elapsedSeconds: StateFlow<Long> = flow {
        val start = workoutDao.getWorkout(workoutId)
            ?.let { runCatching { Instant.parse(it.startedAt) }.getOrNull() }
        while (true) {
            emit(start?.let { Duration.between(it, Instant.now()).seconds.coerceAtLeast(0) } ?: 0L)
            delay(1000)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0L)

    fun finishWorkout(onDone: () -> Unit) {
        viewModelScope.launch {
            finishWorkoutUseCase(workoutId)
            onDone()
        }
    }

    fun discardWorkout(onDone: () -> Unit) {
        viewModelScope.launch {
            workoutRepository.discardWorkout(workoutId)
            onDone()
        }
    }
}
