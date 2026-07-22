package dev.bishnoi.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ExerciseProgress(
    val workoutExerciseId: String,
    val name: String,
    val completedSets: Int,
    val totalSets: Int,
    val isCurrent: Boolean,
) {
    val isDone: Boolean get() = totalSets > 0 && completedSets >= totalSets
}

class WorkoutOverviewViewModel(
    private val workouts: WorkoutRepository,
    private val finishWorkoutUseCase: FinishWorkout,
    private val workoutId: String,
) : ViewModel() {
    val exercises: StateFlow<List<ExerciseProgress>> = workouts.activeWorkout.map { workout ->
        if (workout?.id != workoutId) return@map emptyList()
        val rows = workout.exercises.sortedBy { it.position }.map { exercise ->
            ExerciseProgress(
                workoutExerciseId = exercise.id,
                name = exercise.exerciseName,
                completedSets = exercise.sets.count { it.completed },
                totalSets = exercise.sets.size,
                isCurrent = false,
            )
        }
        val currentIndex = rows.indexOfFirst { !it.isDone }
        rows.mapIndexed { index, row -> row.copy(isCurrent = index == currentIndex) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val elapsedSeconds: StateFlow<Long> = flow {
        val start = workouts.currentActiveWorkout()?.takeIf { it.id == workoutId }
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
            workouts.discardWorkout(workoutId)
            onDone()
        }
    }
}
