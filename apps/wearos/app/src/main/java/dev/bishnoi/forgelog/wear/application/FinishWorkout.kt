package dev.bishnoi.forgelog.wear.application

import android.util.Log
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first

private const val TAG = "FinishWorkout"

class FinishWorkout(
    private val workouts: WorkoutRepository,
    private val publish: suspend (WorkoutPayloadDto) -> Unit,
    private val logWarning: (String, Throwable) -> Unit = { message, error -> Log.w(TAG, message, error) },
) {
    suspend operator fun invoke(workoutId: String) {
        val payload = workouts.finishWorkout(workoutId)
        publishPending(payload)
    }

    suspend fun drainPending() {
        val pending = try {
            workouts.pendingUploads.first()
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not load pending workouts", error)
            return
        }
        pending.forEach { publishPending(it.payload) }
    }

    private suspend fun publishPending(payload: WorkoutPayloadDto) {
        try {
            publish(payload)
            workouts.markPublishAttempt(payload.id)
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not publish pending workout ${payload.id}", error)
        }
    }
}

private fun Exception.rethrowIfCancellation() {
    if (this is CancellationException) throw this
}
