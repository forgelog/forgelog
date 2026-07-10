package dev.bishnoi.forgelog.wear.application

import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRepository
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto

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
        } catch (_: Exception) {
        }
    }

    suspend fun drainUnsynced() {
        val unsynced = try {
            workoutDao.unsyncedWorkouts()
        } catch (_: Exception) {
            return
        }
        for (workout in unsynced) {
            if (workout.endedAt == null) continue
            val payload = try {
                syncRepository.buildWorkoutPayload(workout)
            } catch (_: Exception) {
                continue
            }
            try {
                publish(payload)
                workoutDao.markSynced(workout.id)
            } catch (_: Exception) {
            }
        }
    }
}
