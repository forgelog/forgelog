package dev.bishnoi.forgelog.wear.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val WORKOUT_MAILBOX_PROTOCOL_VERSION = 1

@Serializable
enum class WorkoutWriter(val wireName: String) {
    @SerialName("phone") PHONE("phone"),
    @SerialName("watch") WATCH("watch"),
}

@Serializable
data class EntryVersion(
    @SerialName("changed_at_ms") val changedAtMs: Long,
    val writer: WorkoutWriter,
)

@Serializable
data class VersionedValue<T>(val version: EntryVersion, val value: T)

typealias VersionedString = VersionedValue<String>
typealias VersionedNullableString = VersionedValue<String?>
typealias VersionedLong = VersionedValue<Long?>
typealias VersionedNullableDouble = VersionedValue<Double?>

@Serializable
data class ActiveWorkoutFields(
    @SerialName("routine_id") val routineId: VersionedNullableString,
    @SerialName("routine_structure_version") val routineStructureVersion: VersionedLong,
    val name: VersionedString,
    val notes: VersionedNullableString,
    @SerialName("bodyweight_kg") val bodyweightKg: VersionedNullableDouble,
)

@Serializable
data class WorkoutExerciseFields(
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("exercise_name") val exerciseName: String,
    @SerialName("source_routine_exercise_id") val sourceRoutineExerciseId: String? = null,
    @SerialName("superset_group_id") val supersetGroupId: String? = null,
    @SerialName("exercise_type") val exerciseType: String,
    val notes: String? = null,
)

@Serializable
data class LoggedSetFields(
    @SerialName("source_routine_set_id") val sourceRoutineSetId: String? = null,
    @SerialName("set_type") val setType: String,
    val weight: Double? = null,
    val reps: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    val rpe: Double? = null,
    val completed: Boolean,
    @SerialName("completed_at_ms") val completedAtMs: Long? = null,
)

@Serializable
data class ActiveLoggedSet(
    val id: String,
    val version: EntryVersion,
    val deleted: Boolean,
    val position: Int? = null,
    val value: LoggedSetFields? = null,
)

@Serializable
data class ActiveWorkoutExercise(
    val id: String,
    val version: EntryVersion,
    val deleted: Boolean,
    val position: Int? = null,
    val value: WorkoutExerciseFields? = null,
    val sets: List<ActiveLoggedSet> = emptyList(),
)

@Serializable
data class ActiveWorkoutBody(
    val fields: ActiveWorkoutFields,
    val exercises: List<ActiveWorkoutExercise> = emptyList(),
)

@Serializable
data class LoggedSetBody(
    val id: String,
    @SerialName("source_routine_set_id") val sourceRoutineSetId: String? = null,
    @SerialName("set_type") val setType: String,
    val weight: Double? = null,
    val reps: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    val rpe: Double? = null,
    val completed: Boolean,
    @SerialName("completed_at_ms") val completedAtMs: Long? = null,
)

@Serializable
data class WorkoutExerciseBody(
    val id: String,
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("exercise_name") val exerciseName: String,
    @SerialName("source_routine_exercise_id") val sourceRoutineExerciseId: String? = null,
    @SerialName("superset_group_id") val supersetGroupId: String? = null,
    @SerialName("exercise_type") val exerciseType: String,
    val notes: String? = null,
    val sets: List<LoggedSetBody> = emptyList(),
)

@Serializable
data class WorkoutBody(
    @SerialName("routine_id") val routineId: String? = null,
    @SerialName("routine_structure_version") val routineStructureVersion: Long? = null,
    val name: String,
    val notes: String? = null,
    @SerialName("bodyweight_kg") val bodyweightKg: Double? = null,
    val exercises: List<WorkoutExerciseBody> = emptyList(),
)

@Serializable
sealed interface WorkoutReplicaState {
    @Serializable
    @SerialName("active")
    data class Active(val workout: ActiveWorkoutBody) : WorkoutReplicaState

    @Serializable
    @SerialName("finished")
    data class Finished(
        @SerialName("ended_at_ms") val endedAtMs: Long,
        val workout: WorkoutBody,
    ) : WorkoutReplicaState

    @Serializable
    @SerialName("discarded")
    data object Discarded : WorkoutReplicaState
}

@Serializable
data class WorkoutReplica(
    @SerialName("workout_id") val workoutId: String,
    @SerialName("started_at_ms") val startedAtMs: Long,
    @SerialName("changed_at_ms") val changedAtMs: Long,
    val state: WorkoutReplicaState,
)

@Serializable
data class AuthoredWorkoutReplica(val writer: WorkoutWriter, val replica: WorkoutReplica)

@Serializable
data class WorkoutReceipt(
    @SerialName("workout_id") val workoutId: String,
    @SerialName("watch_started_at_ms") val watchStartedAtMs: Long,
    @SerialName("watch_changed_at_ms") val watchChangedAtMs: Long,
)

@Serializable
data class WorkoutMailbox(
    @SerialName("protocol_version") val protocolVersion: Int = WORKOUT_MAILBOX_PROTOCOL_VERSION,
    val candidate: WorkoutReplica? = null,
    @SerialName("watch_receipt") val watchReceipt: WorkoutReceipt? = null,
)
