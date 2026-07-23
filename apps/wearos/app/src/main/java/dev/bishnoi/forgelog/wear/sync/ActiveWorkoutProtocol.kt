package dev.bishnoi.forgelog.wear.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

const val ACTIVE_WORKOUT_PROTOCOL_VERSION = 1
const val ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES = 90_000

@Serializable
data class CanonicalActiveWorkoutState(
    @SerialName("protocol_version") val protocolVersion: Int = ACTIVE_WORKOUT_PROTOCOL_VERSION,
    @SerialName("coordinator_id") val coordinatorId: String,
    @SerialName("coordinator_epoch") val coordinatorEpoch: String,
    val revision: Long,
    @SerialName("revision_committed_at") val revisionCommittedAt: String,
    val lifecycle: String,
    @SerialName("workout_id") val workoutId: String? = null,
    val workout: ActiveWorkoutSnapshotDto? = null,
    val terminal: ActiveWorkoutTerminalDto? = null,
)

@Serializable
data class ActiveWorkoutTerminalDto(
    @SerialName("ended_at") val endedAt: String,
    @SerialName("operation_id") val operationId: String? = null,
    @SerialName("origin_device_id") val originDeviceId: String? = null,
)

@Serializable
data class ActiveWorkoutSnapshotDto(
    val id: String,
    @SerialName("routine_id") val routineId: String? = null,
    val name: String,
    @SerialName("started_at") val startedAt: String,
    @SerialName("ended_at") val endedAt: String? = null,
    val notes: String? = null,
    @SerialName("bodyweight_kg") val bodyweightKg: Double? = null,
    @SerialName("routine_structure_version") val routineStructureVersion: Int? = null,
    val exercises: List<ActiveWorkoutExerciseDto> = emptyList(),
)

@Serializable
data class ActiveWorkoutExerciseDto(
    val id: String,
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("exercise_name") val exerciseName: String,
    val position: Int,
    @SerialName("exercise_type") val exerciseType: String,
    val notes: String? = null,
    @SerialName("source_routine_exercise_id") val sourceRoutineExerciseId: String? = null,
    @SerialName("superset_group_id") val supersetGroupId: String? = null,
    @SerialName("pr_baselines") val prBaselines: Map<String, Double> = emptyMap(),
    @SerialName("alerted_record_types") val alertedRecordTypes: Set<String> = emptySet(),
    val sets: List<ActiveWorkoutSetDto> = emptyList(),
)

@Serializable
data class ActiveWorkoutSetDto(
    val id: String,
    @SerialName("source_routine_set_id") val sourceRoutineSetId: String? = null,
    val position: Int,
    @SerialName("set_type") val setType: String,
    val weight: Double? = null,
    val reps: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("distance_meters") val distanceMeters: Double? = null,
    val rpe: Double? = null,
    val completed: Boolean = false,
    @SerialName("completed_at") val completedAt: String? = null,
)

@Serializable
sealed interface ActiveWorkoutOperation

@Serializable
@SerialName("start_workout")
data class StartWorkoutOperation(val workout: ActiveWorkoutSnapshotDto) : ActiveWorkoutOperation

@Serializable
@SerialName("recover_workout")
data class RecoverWorkoutOperation(
    @SerialName("recovery_lifecycle") val recoveryLifecycle: String,
    val workout: ActiveWorkoutSnapshotDto? = null,
    @SerialName("old_epoch") val oldEpoch: String,
    @SerialName("old_operation_ids") val oldOperationIds: List<String> = emptyList(),
) : ActiveWorkoutOperation

@Serializable @SerialName("rename_workout")
data class RenameWorkoutOperation(val name: String) : ActiveWorkoutOperation

@Serializable @SerialName("update_workout_notes")
data class UpdateWorkoutNotesOperation(val notes: String? = null) : ActiveWorkoutOperation

@Serializable @SerialName("add_exercise")
data class AddExerciseOperation(val exercise: ActiveWorkoutExerciseDto) : ActiveWorkoutOperation

@Serializable @SerialName("remove_exercise")
data class RemoveExerciseOperation(@SerialName("exercise_id") val exerciseId: String) : ActiveWorkoutOperation

@Serializable @SerialName("reorder_exercises")
data class ReorderExercisesOperation(@SerialName("exercise_ids") val exerciseIds: List<String>) : ActiveWorkoutOperation

@Serializable @SerialName("update_exercise")
data class UpdateExerciseOperation(
    @SerialName("exercise_id") val exerciseId: String,
    val field: String,
    val value: String? = null,
) : ActiveWorkoutOperation

@Serializable @SerialName("add_set")
data class AddSetOperation(
    @SerialName("exercise_id") val exerciseId: String,
    val set: ActiveWorkoutSetDto,
) : ActiveWorkoutOperation

@Serializable @SerialName("remove_set")
data class RemoveSetOperation(
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("set_id") val setId: String,
) : ActiveWorkoutOperation

@Serializable @SerialName("reorder_sets")
data class ReorderSetsOperation(
    @SerialName("exercise_id") val exerciseId: String,
    @SerialName("set_ids") val setIds: List<String>,
) : ActiveWorkoutOperation

@Serializable @SerialName("update_set")
data class UpdateSetOperation(
    @SerialName("set_id") val setId: String,
    val field: String,
    val value: JsonElement? = null,
) : ActiveWorkoutOperation

@Serializable @SerialName("complete_set")
data class CompleteSetOperation(
    @SerialName("set_id") val setId: String,
    @SerialName("exercise_id") val exerciseId: String,
    val completed: Boolean,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("alerted_record_types") val alertedRecordTypes: Set<String> = emptySet(),
) : ActiveWorkoutOperation

@Serializable @SerialName("finish_workout")
data class FinishWorkoutOperation(@SerialName("ended_at") val endedAt: String) : ActiveWorkoutOperation

@Serializable @SerialName("discard_workout")
data class DiscardWorkoutOperation(@SerialName("discarded_at") val discardedAt: String) : ActiveWorkoutOperation

@Serializable
data class ActiveWorkoutMutationDto(
    @SerialName("protocol_version") val protocolVersion: Int = ACTIVE_WORKOUT_PROTOCOL_VERSION,
    @SerialName("operation_id") val operationId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_sequence") val deviceSequence: Long,
    @SerialName("coordinator_epoch") val coordinatorEpoch: String,
    @SerialName("workout_id") val workoutId: String,
    @SerialName("base_revision") val baseRevision: Long,
    @SerialName("predecessor_operation_id") val predecessorOperationId: String? = null,
    @SerialName("conflict_keys") val conflictKeys: List<String>,
    @SerialName("created_at") val createdAt: String,
    val operation: ActiveWorkoutOperation,
)

@Serializable
data class ActiveWorkoutResultDto(
    @SerialName("protocol_version") val protocolVersion: Int = ACTIVE_WORKOUT_PROTOCOL_VERSION,
    @SerialName("coordinator_epoch") val coordinatorEpoch: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("device_sequence") val deviceSequence: Long,
    @SerialName("operation_id") val operationId: String? = null,
    val status: String,
    @SerialName("canonical_revision") val canonicalRevision: Long,
    val reason: String? = null,
    @SerialName("conflict_keys") val conflictKeys: List<String> = emptyList(),
    val idempotent: Boolean = false,
    val resolution: String? = null,
    @SerialName("resolution_revision") val resolutionRevision: Long? = null,
    @SerialName("terminal_workout") val terminalWorkout: ActiveWorkoutSnapshotDto? = null,
)

fun deriveConflictKeys(operation: ActiveWorkoutOperation, workoutId: String): List<String> = when (operation) {
    is StartWorkoutOperation, is RecoverWorkoutOperation ->
        listOf("active_workout", "workout:$workoutId:entity", "workout:$workoutId:status")
    is RenameWorkoutOperation -> listOf("workout:$workoutId:name")
    is UpdateWorkoutNotesOperation -> listOf("workout:$workoutId:notes")
    is AddExerciseOperation -> listOf("exercise_order", "exercise:${operation.exercise.id}:entity")
    is RemoveExerciseOperation -> listOf(
        "exercise_order", "exercise:${operation.exerciseId}:entity", "set_order:${operation.exerciseId}",
    )
    is ReorderExercisesOperation -> listOf("exercise_order")
    is UpdateExerciseOperation -> listOf("exercise:${operation.exerciseId}:${operation.field}")
    is AddSetOperation -> listOf("set_order:${operation.exerciseId}", "set:${operation.set.id}:entity")
    is RemoveSetOperation -> listOf("set_order:${operation.exerciseId}", "set:${operation.setId}:entity")
    is ReorderSetsOperation -> listOf("set_order:${operation.exerciseId}")
    is UpdateSetOperation -> listOf("set:${operation.setId}:${operation.field}")
    is CompleteSetOperation -> listOf(
        "alerts:${operation.exerciseId}", "set:${operation.setId}:completed", "set:${operation.setId}:completed_at",
    )
    is FinishWorkoutOperation, is DiscardWorkoutOperation -> listOf("workout:$workoutId:status")
}.sorted()

fun assertActiveWorkoutPayloadSize(json: String) {
    require(json.toByteArray(Charsets.UTF_8).size <= ACTIVE_WORKOUT_MAX_PAYLOAD_BYTES) {
        "active_workout_payload_too_large"
    }
}

fun normalizedActiveWorkoutJson(json: String): String = normalizeJson(syncJson.parseToJsonElement(json))

private fun normalizeJson(element: JsonElement): String = when (element) {
    is JsonObject -> element.entries.sortedBy { it.key }.joinToString(prefix = "{", postfix = "}") {
        "${JsonPrimitive(it.key)}:${normalizeJson(it.value)}"
    }
    is JsonArray -> element.joinToString(prefix = "[", postfix = "]") { normalizeJson(it) }
    else -> element.toString()
}
