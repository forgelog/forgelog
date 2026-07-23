package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutMutationDto
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutResultDto
import dev.bishnoi.forgelog.wear.sync.CanonicalActiveWorkoutState
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto
import kotlinx.serialization.Serializable

const val WORKOUT_STATE_FORMAT_VERSION = 2

@Serializable
data class WorkoutState(
    val formatVersion: Int = WORKOUT_STATE_FORMAT_VERSION,
    val activeWorkout: ActiveWorkout? = null,
    val pendingUploads: List<PendingWorkout> = emptyList(),
    val installationId: String? = null,
    val nextDeviceSequence: Long = 1,
    val coordinatorEpoch: String? = null,
    val canonicalRevision: Long = 0,
    val canonicalState: CanonicalActiveWorkoutState? = null,
    val canonicalPayload: String? = null,
    val pendingMutations: List<ActiveWorkoutMutationDto> = emptyList(),
    val acceptedAwaitingCanonical: List<ActiveWorkoutResultDto> = emptyList(),
    val rejectedMutations: List<ActiveWorkoutResultDto> = emptyList(),
    val conflictDrafts: List<ConflictDraft> = emptyList(),
    val recoveryDraft: RecoveryDraft? = null,
    val pendingTerminal: ActiveWorkout? = null,
    val pendingTerminalLifecycle: String? = null,
    val legacyMode: Boolean = false,
    val syncError: String? = null,
)

@Serializable
data class ConflictDraft(
    val rootOperationId: String,
    val workout: ActiveWorkout?,
    val reason: String,
)

@Serializable
data class RecoveryDraft(
    val oldEpoch: String?,
    val oldOperationIds: List<String>,
    val workout: ActiveWorkout?,
)

@Serializable
data class WorkoutStateV1(
    val formatVersion: Int = 1,
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
    val notes: String? = null,
    val bodyweightKg: Double? = null,
    val routineStructureVersion: Int? = null,
    val endedAt: String? = null,
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
    val notes: String? = null,
    val sourceRoutineExerciseId: String? = null,
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
    val sourceRoutineSetId: String? = null,
)
