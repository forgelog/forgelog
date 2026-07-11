package dev.bishnoi.forgelog.wear.application

import android.util.Log
import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRepository
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto

private const val TAG = "FinishWorkout"

class FinishWorkout(
    private val workoutRepository: WorkoutRepository,
    private val syncRepository: SyncRepository,
    private val workoutDao: WorkoutDao,
    private val publish: suspend (WorkoutPayloadDto) -> Unit,
) {
    suspend operator fun invoke(workoutId: String) {
        workoutRepository.finishWorkout(workoutId)
        val finished = workoutDao.getWorkout(workoutId) ?: return
        val payload = syncRepository.buildWorkoutPayload(finished)
        try {
            publish(payload)
            workoutDao.markSynced(workoutId)
        } catch (error: Exception) {
            Log.w(TAG, "Could not publish finished workout $workoutId", error)
        }
    }

    suspend fun drainUnsynced() {
        val unsynced = try {
            workoutDao.unsyncedWorkouts()
        } catch (error: Exception) {
            Log.w(TAG, "Could not load unsynced workouts", error)
            return
        }
        for (workout in unsynced) {
            if (workout.endedAt == null) continue
            val payload = try {
                syncRepository.buildWorkoutPayload(workout)
            } catch (error: Exception) {
                Log.w(TAG, "Could not build payload for workout ${workout.id}", error)
                continue
            }
            try {
                publish(payload)
                workoutDao.markSynced(workout.id)
            } catch (error: Exception) {
                Log.w(TAG, "Could not publish unsynced workout ${workout.id}", error)
            }
        }
    }
}
