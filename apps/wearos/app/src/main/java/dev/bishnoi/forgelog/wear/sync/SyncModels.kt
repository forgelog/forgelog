package dev.bishnoi.forgelog.wear.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Wire shapes matching apps/mobile/src/db/repositories/sync.ts exactly
// (field names, snake_case where the phone's DB columns are snake_case) so
// JSON round-trips without a translation layer on either side.

@Serializable
data class SyncSnapshot(
    val routines: List<RoutineDetailDto> = emptyList(),
    val personalRecords: List<PersonalRecordDto> = emptyList(),
)

@Serializable
data class RoutineDetailDto(
    val id: String,
    val name: String,
    val position: Int,
    val exercises: List<RoutineExerciseDetailDto> = emptyList(),
)

@Serializable
data class RoutineExerciseDetailDto(
    val id: String,
    @SerialName("routine_id") val routineId: String,
    @SerialName("exercise_id") val exerciseId: String,
    val position: Int,
    @SerialName("superset_group_id") val supersetGroupId: String? = null,
    @SerialName("rest_seconds") val restSeconds: Int? = null,
    @SerialName("tracking_type") val trackingType: String? = null,
    val exercise: ExerciseDto,
    val sets: List<RoutineSetDto> = emptyList(),
)

@Serializable
data class ExerciseDto(
    val id: String,
    val name: String,
    @SerialName("tracking_type") val trackingType: String? = null,
)

@Serializable
data class RoutineSetDto(
    val id: String,
    @SerialName("routine_exercise_id") val routineExerciseId: String,
    val position: Int,
    @SerialName("set_type") val setType: String,
    @SerialName("target_weight") val targetWeight: Double? = null,
    @SerialName("target_reps") val targetReps: Int? = null,
    @SerialName("target_duration_seconds") val targetDurationSeconds: Int? = null,
    @SerialName("target_distance_meters") val targetDistanceMeters: Double? = null,
)

@Serializable
data class PersonalRecordDto(
    val id: String,
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("record_type") val recordType: String,
    val value: Double,
    @SerialName("achieved_at") val achievedAt: String,
)

// Watch -> phone: apps/mobile/src/db/repositories/sync.ts WatchWorkoutPayload.

@Serializable
data class WorkoutPayloadDto(
    val id: String,
    @SerialName("routine_id") val routineId: String? = null,
    val name: String,
    @SerialName("started_at") val startedAt: String,
    @SerialName("ended_at") val endedAt: String? = null,
    val notes: String? = null,
    val exercises: List<WorkoutExercisePayloadDto>,
)

@Serializable
data class WorkoutExercisePayloadDto(
    val id: String,
    @SerialName("exercise_id") val exerciseId: String,
    val position: Int,
    @SerialName("superset_group_id") val supersetGroupId: String? = null,
    @SerialName("tracking_type") val trackingType: String? = null,
    @SerialName("rest_seconds") val restSeconds: Int? = null,
    val notes: String? = null,
    val sets: List<LoggedSetPayloadDto>,
)

@Serializable
data class LoggedSetPayloadDto(
    val id: String,
    @SerialName("workout_exercise_id") val workoutExerciseId: String,
    val position: Int,
    @SerialName("set_type") val setType: String,
    val weight: Double? = null,
    val reps: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    val rpe: Double? = null,
    val completed: Boolean,
    @SerialName("completed_at") val completedAt: String? = null,
)
