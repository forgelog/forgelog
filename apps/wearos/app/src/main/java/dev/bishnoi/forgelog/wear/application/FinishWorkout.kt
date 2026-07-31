package dev.bishnoi.forgelog.wear.application

import dev.bishnoi.forgelog.wear.data.WorkoutRepository

class FinishWorkout(
    private val workouts: WorkoutRepository,
) {
    suspend operator fun invoke(workoutId: String) {
        workouts.finishWorkout(workoutId)
    }
}
