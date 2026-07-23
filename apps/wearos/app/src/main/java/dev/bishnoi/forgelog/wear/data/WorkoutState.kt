package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto
import kotlinx.serialization.Serializable

const val WORKOUT_STATE_FORMAT_VERSION = 1

@Serializable
data class WorkoutState(
    val formatVersion: Int = WORKOUT_STATE_FORMAT_VERSION,
    val activeWorkout: ActiveWorkout? = null,
    val pendingUploads: List<PendingWorkout> = emptyList(),
)

@Serializable
data class PendingWorkout(
    val payload: WorkoutPayloadDto,
    val queuedAtEpochMillis: Long,
    val lastPublishAttemptAtEpochMillis: Long? = null,
)

@Serializable
data class ActiveWorkout(
    val id: String,
    val routineId: String?,
    val name: String,
    val startedAt: String,
    val exercises: List<ActiveWorkoutExercise>,
)

@Serializable
data class ActiveWorkoutExercise(
    val id: String,
    val exerciseId: String,
    val exerciseName: String,
    val position: Int,
    val supersetGroupId: String? = null,
    val exerciseType: String,
    val initialRecords: Map<String, Double> = emptyMap(),
    val alertedRecordTypes: Set<String> = emptySet(),
    val sets: List<ActiveLoggedSet> = emptyList(),
)

@Serializable
data class ActiveLoggedSet(
    val id: String,
    val position: Int,
    val setType: String,
    val weight: Double? = null,
    val reps: Int? = null,
    val durationSeconds: Int? = null,
    val distanceMeters: Double? = null,
    val rpe: Double? = null,
    val completed: Boolean = false,
    val completedAt: String? = null,
)
