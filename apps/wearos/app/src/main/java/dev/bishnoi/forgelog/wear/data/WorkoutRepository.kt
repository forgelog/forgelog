package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStore
import dev.bishnoi.forgelog.wear.logic.ExerciseType
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SetPerformance
import dev.bishnoi.forgelog.wear.logic.computeRecords
import dev.bishnoi.forgelog.wear.logic.newId
import dev.bishnoi.forgelog.wear.logic.nextSetType
import dev.bishnoi.forgelog.wear.logic.requireExerciseType
import dev.bishnoi.forgelog.wear.sync.LoggedSetPayloadDto
import dev.bishnoi.forgelog.wear.sync.WorkoutExercisePayloadDto
import dev.bishnoi.forgelog.wear.sync.WorkoutPayloadDto
import dev.bishnoi.forgelog.wear.sync.ACTIVE_WORKOUT_PROTOCOL_VERSION
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutExerciseDto
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutMutationDto
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutSetDto
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutSnapshotDto
import dev.bishnoi.forgelog.wear.sync.CanonicalActiveWorkoutState
import dev.bishnoi.forgelog.wear.sync.StartWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.AddSetOperation
import dev.bishnoi.forgelog.wear.sync.CompleteSetOperation
import dev.bishnoi.forgelog.wear.sync.DiscardWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.FinishWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.RemoveExerciseOperation
import dev.bishnoi.forgelog.wear.sync.RemoveSetOperation
import dev.bishnoi.forgelog.wear.sync.UpdateSetOperation
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutResultDto
import dev.bishnoi.forgelog.wear.sync.ActiveSyncMetadataDto
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.AddExerciseOperation
import dev.bishnoi.forgelog.wear.sync.RecoverWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.RenameWorkoutOperation
import dev.bishnoi.forgelog.wear.sync.ReorderExercisesOperation
import dev.bishnoi.forgelog.wear.sync.ReorderSetsOperation
import dev.bishnoi.forgelog.wear.sync.UpdateExerciseOperation
import dev.bishnoi.forgelog.wear.sync.UpdateWorkoutNotesOperation
import dev.bishnoi.forgelog.wear.sync.assertActiveWorkoutPayloadSize
import dev.bishnoi.forgelog.wear.sync.deriveConflictKeys
import dev.bishnoi.forgelog.wear.sync.syncJson
import dev.bishnoi.forgelog.wear.sync.normalizedActiveWorkoutJson
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.contentOrNull
import java.security.MessageDigest

class ActiveWorkoutExistsException(val workoutId: String) :
    IllegalStateException("An active workout already exists: $workoutId")

enum class WorkoutStorageStatus { AVAILABLE, UNAVAILABLE }

class WorkoutRepository(
    private val store: DataStore<WorkoutState>,
    private val references: ReferenceRepository,
    private val now: () -> Instant = Instant::now,
    private val newId: () -> String = ::newId,
) {
    val state: Flow<WorkoutState> = store.data
    val activeWorkout: Flow<ActiveWorkout?> = state
        .map { it.activeWorkout }
        .catch { error ->
            error.rethrowIfCancellation()
            emit(null)
        }
    val storageStatus: Flow<WorkoutStorageStatus> = state
        .map { WorkoutStorageStatus.AVAILABLE }
        .catch { error ->
            error.rethrowIfCancellation()
            emit(WorkoutStorageStatus.UNAVAILABLE)
        }
        .distinctUntilChanged()
    val pendingUploads: Flow<List<PendingWorkout>> = state.map { it.pendingUploads }

    suspend fun startWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var started: ActiveWorkout? = null
        store.updateData { current ->
            current.activeWorkout?.let { throw ActiveWorkoutExistsException(it.id) }
            val identified = current.withIdentityIfNeeded()
            val workout = createWorkout(routineId, name)
            started = workout
            identified.withOptimisticMutation(workout, StartWorkoutOperation(workout.toProtocolSnapshot()))
        }
        return requireNotNull(started)
    }

    suspend fun startOrResumeWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var selected: ActiveWorkout? = null
        store.updateData { current ->
            val identified = current.withIdentityIfNeeded()
            val workout = identified.activeWorkout ?: createWorkout(routineId, name)
            selected = workout
            if (identified.activeWorkout == null) {
                identified.withOptimisticMutation(workout, StartWorkoutOperation(workout.toProtocolSnapshot()))
            } else identified
        }
        return requireNotNull(selected)
    }

    private suspend fun createWorkout(routineId: String, name: String?): ActiveWorkout {
        val reference = requireNotNull(references.workoutReference(routineId)) { "Routine not found: $routineId" }
        val routine = reference.routine
        val workout = ActiveWorkout(
            id = newId(),
            routineId = routineId,
            name = name ?: routine.name,
            startedAt = now().toString(),
            exercises = routine.exercises.sortedBy { it.position }.map { routineExercise ->
                val exerciseType = requireExerciseType(routineExercise.exerciseType)
                ActiveWorkoutExercise(
                    id = newId(),
                    exerciseId = routineExercise.exerciseId,
                    exerciseName = routineExercise.exercise.name,
                    position = routineExercise.position,
                    supersetGroupId = routineExercise.supersetGroupId,
                    exerciseType = exerciseType.value,
                    initialRecords = reference.recordsByExercise[routineExercise.exerciseId].orEmpty(),
                    sets = routineExercise.sets.sortedBy { it.position }.map { set ->
                        ActiveLoggedSet(
                            id = newId(),
                            position = set.position,
                            setType = set.setType,
                            weight = set.targetWeight,
                            reps = set.targetReps,
                            durationSeconds = set.targetDurationSeconds,
                            distanceMeters = set.targetDistanceMeters,
                        )
                    },
                )
            },
        )
        return workout
    }

    suspend fun updateSetValues(setId: String, weight: Double?, reps: Int?) {
        updateSet(
            setId,
            listOf(
                UpdateSetOperation(setId, "weight", weight?.let(::JsonPrimitive) ?: JsonNull),
                UpdateSetOperation(setId, "reps", reps?.let(::JsonPrimitive) ?: JsonNull),
            ),
        ) { it.copy(weight = weight, reps = reps) }
    }

    suspend fun updateSetDuration(setId: String, durationSeconds: Int?) {
        updateSet(setId, listOf(UpdateSetOperation(setId, "duration_seconds", durationSeconds?.let(::JsonPrimitive) ?: JsonNull))) {
            it.copy(durationSeconds = durationSeconds)
        }
    }

    suspend fun updateSetDistance(setId: String, distanceMeters: Double?) {
        updateSet(setId, listOf(UpdateSetOperation(setId, "distance_meters", distanceMeters?.let(::JsonPrimitive) ?: JsonNull))) {
            it.copy(distanceMeters = distanceMeters)
        }
    }

    suspend fun cycleSetType(setId: String) {
        updateSet(setId, emptyList()) { it.copy(setType = nextSetType(it.setType)) }
    }

    suspend fun markSetCompleted(setId: String, completed: Boolean): List<RecordType> {
        var newlyAlerted = emptyList<RecordType>()
        store.updateData { current ->
            val workout = requireNotNull(current.activeWorkout) { "No active workout" }
            var found = false
            val exercises = workout.exercises.map { exercise ->
                if (exercise.sets.none { it.id == setId }) return@map exercise
                found = true
                val sets = exercise.sets.map { set ->
                    if (set.id == setId) {
                        set.copy(completed = completed, completedAt = if (completed) now().toString() else null)
                    } else {
                        set
                    }
                }
                if (!completed) return@map exercise.copy(sets = sets)
                val exerciseType = ExerciseType.fromValue(exercise.exerciseType) ?: ExerciseType.WEIGHT_REPS
                val candidates = computeRecords(
                    sets.filter { it.completed }.map {
                        SetPerformance(it.weight, it.reps, exerciseType, it.setType)
                    },
                )
                newlyAlerted = candidates.filter { (type, value) ->
                    val baseline = exercise.initialRecords[type.value]
                    baseline != null && value > baseline && type.value !in exercise.alertedRecordTypes
                }.keys.toList()
                exercise.copy(
                    sets = sets,
                    alertedRecordTypes = exercise.alertedRecordTypes + newlyAlerted.map { it.value },
                )
            }
            require(found) { "Set not found: $setId" }
            val updated = workout.copy(exercises = exercises)
            current.withOptimisticMutation(
                updated,
                CompleteSetOperation(
                    setId = setId,
                    exerciseId = exercises.first { exercise -> exercise.sets.any { it.id == setId } }.id,
                    completed = completed,
                    completedAt = exercises.flatMap { it.sets }.first { it.id == setId }.completedAt,
                    alertedRecordTypes = newlyAlerted.map { it.value }.toSet(),
                ),
            )
        }
        return newlyAlerted
    }

    suspend fun addSet(workoutExerciseId: String): ActiveLoggedSet {
        var added: ActiveLoggedSet? = null
        store.updateData { current ->
            val workout = requireNotNull(current.activeWorkout) { "No active workout" }
            var found = false
            val exercises = workout.exercises.map { exercise ->
                if (exercise.id != workoutExerciseId) return@map exercise
                found = true
                val set = ActiveLoggedSet(
                    id = newId(),
                    position = (exercise.sets.maxOfOrNull { it.position } ?: -1) + 1,
                    setType = "normal",
                )
                added = set
                exercise.copy(sets = exercise.sets + set)
            }
            require(found) { "Workout exercise not found: $workoutExerciseId" }
            val updated = workout.copy(exercises = exercises)
            current.withOptimisticMutation(updated, AddSetOperation(workoutExerciseId, requireNotNull(added).toProtocolSet()))
        }
        return requireNotNull(added)
    }

    suspend fun removeSet(setId: String) {
        updateActive({ workout ->
            var found = false
            var exerciseId: String? = null
            val exercises = workout.exercises.map { exercise ->
                if (exercise.sets.any { it.id == setId }) {
                    found = true
                    exerciseId = exercise.id
                }
                exercise.copy(sets = exercise.sets.filterNot { it.id == setId })
            }
            require(found) { "Set not found: $setId" }
            workout.copy(exercises = exercises)
        }) { before, _ -> listOf(RemoveSetOperation(before.exercises.first { it.sets.any { set -> set.id == setId } }.id, setId)) }
    }

    suspend fun deleteExercise(workoutExerciseId: String) {
        updateActive({ workout ->
            require(workout.exercises.any { it.id == workoutExerciseId }) {
                "Workout exercise not found: $workoutExerciseId"
            }
            workout.copy(exercises = workout.exercises.filterNot { it.id == workoutExerciseId })
        }) { _, _ -> listOf(RemoveExerciseOperation(workoutExerciseId)) }
    }

    suspend fun discardWorkout(workoutId: String) {
        store.updateData { current ->
            require(current.activeWorkout?.id == workoutId) { "Active workout not found: $workoutId" }
            val workout = requireNotNull(current.activeWorkout)
            val updated = current.withOptimisticMutation(
                workout,
                DiscardWorkoutOperation(now().toString()),
            )
            if (current.legacyMode || current.coordinatorEpoch == null) {
                updated.copy(activeWorkout = null, legacyMode = current.pendingUploads.isNotEmpty())
            } else updated.copy(
                activeWorkout = null,
                pendingTerminal = workout,
                pendingTerminalLifecycle = "discarded",
            )
        }
    }

    suspend fun finishWorkout(workoutId: String): WorkoutPayloadDto {
        var payload: WorkoutPayloadDto? = null
        store.updateData { current ->
            val workout = current.activeWorkout?.takeIf { it.id == workoutId }
            if (workout == null) {
                payload = current.pendingUploads.firstOrNull { it.payload.id == workoutId }?.payload
                requireNotNull(payload) {
                    "Active or pending workout not found: $workoutId"
                }
                return@updateData current
            }
            val provisional = workout.toPayload(now().toString())
            val endedAt = requireNotNull(provisional.endedAt)
            val updated = current.withOptimisticMutation(workout, FinishWorkoutOperation(endedAt))
            val finishMutation = updated.pendingMutations.lastOrNull()
                ?.takeIf { it.operation is FinishWorkoutOperation && it.workoutId == workoutId }
            val finished = if (finishMutation == null) provisional else provisional.copy(
                activeSync = ActiveSyncMetadataDto(
                    finishOperationId = finishMutation.operationId,
                    deviceId = finishMutation.deviceId,
                    deviceSequence = finishMutation.deviceSequence,
                    canonicalRevision = null,
                    provisional = true,
                    payloadHash = sha256(normalizedActiveWorkoutJson(syncJson.encodeToString(WorkoutPayloadDto.serializer(), provisional))),
                ),
            )
            payload = finished
            val pending = current.pendingUploads.filterNot { it.payload.id == workoutId } +
                PendingWorkout(finished, now().toEpochMilli())
            updated.copy(
                activeWorkout = null,
                pendingUploads = pending,
                pendingTerminal = if (current.legacyMode || current.coordinatorEpoch == null) null else workout.copy(endedAt = endedAt),
                pendingTerminalLifecycle = if (current.legacyMode || current.coordinatorEpoch == null) null else "finished",
            )
        }
        return requireNotNull(payload) {
            "Active workout not found: $workoutId"
        }
    }

    suspend fun markPublishAttempt(workoutId: String, attemptedAtEpochMillis: Long = now().toEpochMilli()) {
        store.updateData { current ->
            current.copy(pendingUploads = current.pendingUploads.map { pending ->
                if (pending.payload.id == workoutId) pending.copy(lastPublishAttemptAtEpochMillis = attemptedAtEpochMillis)
                else pending
            })
        }
    }

    suspend fun acknowledgeWorkout(workoutId: String) {
        store.updateData { current ->
            val remaining = current.pendingUploads.filterNot { it.payload.id == workoutId }
            current.copy(
                pendingUploads = remaining,
                pendingTerminal = current.pendingTerminal?.takeUnless { it.id == workoutId },
                pendingTerminalLifecycle = if (current.pendingTerminal?.id == workoutId) null else current.pendingTerminalLifecycle,
                legacyMode = current.legacyMode && (current.activeWorkout != null || remaining.isNotEmpty()),
            )
        }
    }

    suspend fun currentActiveWorkout(): ActiveWorkout? = state.first().activeWorkout

    suspend fun applyCanonicalState(canonical: CanonicalActiveWorkoutState): Boolean {
        require(canonical.protocolVersion == ACTIVE_WORKOUT_PROTOCOL_VERSION) { "unsupported_active_workout_version" }
        assertActiveWorkoutPayloadSize(syncJson.encodeToString(CanonicalActiveWorkoutState.serializer(), canonical))
        var applied = false
        store.updateData { current ->
            val normalized = syncJson.encodeToString(CanonicalActiveWorkoutState.serializer(), canonical)
            if (current.coordinatorEpoch == null && current.legacyMode) {
                return@updateData current.copy(
                    coordinatorEpoch = canonical.coordinatorEpoch,
                    canonicalRevision = canonical.revision,
                    canonicalState = canonical,
                    canonicalPayload = normalized,
                    syncError = "legacy_mode",
                )
            }
            if (current.coordinatorEpoch == null) {
                val localWorkout = current.activeWorkout ?: current.pendingTerminal
                if (localWorkout != null) {
                    val deviceId = current.installationId ?: newId()
                    val operationId = newId()
                    val operation: ActiveWorkoutOperation = if (current.activeWorkout != null) {
                        StartWorkoutOperation(localWorkout.toProtocolSnapshot())
                    } else {
                        RecoverWorkoutOperation(
                            recoveryLifecycle = current.pendingTerminalLifecycle ?: "finished",
                            workout = localWorkout.toProtocolSnapshot(),
                            oldEpoch = "uncoordinated",
                        )
                    }
                    val mutation = ActiveWorkoutMutationDto(
                        operationId = operationId,
                        deviceId = deviceId,
                        deviceSequence = 1,
                        coordinatorEpoch = canonical.coordinatorEpoch,
                        workoutId = localWorkout.id,
                        baseRevision = canonical.revision,
                        predecessorOperationId = null,
                        conflictKeys = deriveConflictKeys(operation, localWorkout.id),
                        createdAt = now().toString(),
                        operation = operation,
                    )
                    assertActiveWorkoutPayloadSize(syncJson.encodeToString(ActiveWorkoutMutationDto.serializer(), mutation))
                    applied = true
                    return@updateData current.copy(
                        installationId = deviceId,
                        coordinatorEpoch = canonical.coordinatorEpoch,
                        canonicalRevision = canonical.revision,
                        canonicalState = canonical,
                        canonicalPayload = normalized,
                        nextDeviceSequence = 2,
                        pendingMutations = listOf(mutation),
                        acceptedAwaitingCanonical = emptyList(),
                        recoveryDraft = if (operation is RecoverWorkoutOperation) RecoveryDraft(
                            oldEpoch = null,
                            oldOperationIds = emptyList(),
                            workout = localWorkout,
                        ) else null,
                        syncError = "coordinator_start_required",
                    )
                }
            }

            var source = current
            if (current.coordinatorEpoch == canonical.coordinatorEpoch) {
                if (canonical.revision < current.canonicalRevision) return@updateData current
                if (canonical.revision == current.canonicalRevision && current.canonicalState != null) {
                    if (current.canonicalPayload != normalized) {
                        return@updateData current.copy(syncError = "equal_revision_payload_mismatch")
                    }
                    return@updateData current
                }
            } else if (current.coordinatorEpoch != null) {
                val hasLocalData = current.activeWorkout != null || current.pendingMutations.isNotEmpty() ||
                    current.pendingTerminal != null || current.conflictDrafts.isNotEmpty()
                if (hasLocalData) {
                    val localWorkout = current.activeWorkout ?: current.pendingTerminal
                    if (localWorkout?.toProtocolSnapshot() == canonical.workout && current.conflictDrafts.isEmpty()) {
                        source = current.copy(
                            pendingMutations = emptyList(),
                            acceptedAwaitingCanonical = emptyList(),
                            nextDeviceSequence = 1,
                            recoveryDraft = null,
                        )
                    } else {
                        val deviceId = current.installationId ?: newId()
                        val operationId = newId()
                        val recoveryWorkoutId = localWorkout?.id ?: canonical.workoutId.orEmpty()
                        val recovery = RecoverWorkoutOperation(
                            recoveryLifecycle = current.pendingTerminalLifecycle ?: "active",
                            workout = localWorkout?.toProtocolSnapshot(),
                            oldEpoch = current.coordinatorEpoch,
                            oldOperationIds = current.pendingMutations.map { it.operationId },
                        )
                        val mutation = ActiveWorkoutMutationDto(
                            operationId = operationId,
                            deviceId = deviceId,
                            deviceSequence = 1,
                            coordinatorEpoch = canonical.coordinatorEpoch,
                            workoutId = recoveryWorkoutId,
                            baseRevision = canonical.revision,
                            predecessorOperationId = null,
                            conflictKeys = deriveConflictKeys(recovery, recoveryWorkoutId),
                            createdAt = now().toString(),
                            operation = recovery,
                        )
                        return@updateData current.copy(
                            installationId = deviceId,
                            coordinatorEpoch = canonical.coordinatorEpoch,
                            canonicalRevision = canonical.revision,
                            canonicalState = canonical,
                            canonicalPayload = normalized,
                            nextDeviceSequence = 2,
                            pendingMutations = listOf(mutation),
                            acceptedAwaitingCanonical = emptyList(),
                            recoveryDraft = RecoveryDraft(
                                oldEpoch = current.coordinatorEpoch,
                                oldOperationIds = current.pendingMutations.map { it.operationId },
                                workout = localWorkout,
                            ),
                            syncError = "coordinator_recovery_required",
                        )
                    }
                } else {
                    source = current.copy(
                        nextDeviceSequence = 1,
                        pendingMutations = emptyList(),
                        acceptedAwaitingCanonical = emptyList(),
                    )
                }
            }
            applied = true
            val acceptedIds = source.acceptedAwaitingCanonical
                .filter { it.canonicalRevision <= canonical.revision }
                .mapNotNull { it.operationId }
                .toSet()
            val remaining = source.pendingMutations.filterNot { it.operationId in acceptedIds }
            val baseWorkout = canonical.workout?.toActiveWorkout()
            val replay = replayMutations(baseWorkout, remaining)
            val canonicalizedUploads = source.pendingUploads.map { pending ->
                val metadata = pending.payload.activeSync ?: return@map pending
                val accepted = source.acceptedAwaitingCanonical.firstOrNull {
                    it.operationId == metadata.finishOperationId && it.canonicalRevision <= canonical.revision
                } ?: return@map pending
                val terminal = accepted.terminalWorkout ?: canonical.workout ?: return@map pending
                val normalized = terminal.toActiveWorkout().toPayload(requireNotNull(terminal.endedAt))
                pending.copy(payload = normalized.copy(activeSync = metadata.copy(
                    canonicalRevision = accepted.canonicalRevision,
                    provisional = false,
                    payloadHash = sha256(normalizedActiveWorkoutJson(syncJson.encodeToString(WorkoutPayloadDto.serializer(), normalized))),
                )))
            }
            source.copy(
                coordinatorEpoch = canonical.coordinatorEpoch,
                canonicalRevision = canonical.revision,
                canonicalState = canonical,
                canonicalPayload = normalized,
                activeWorkout = replay.workout,
                pendingMutations = remaining,
                acceptedAwaitingCanonical = source.acceptedAwaitingCanonical
                    .filter { it.canonicalRevision > canonical.revision },
                pendingUploads = canonicalizedUploads,
                legacyMode = source.legacyMode && (source.activeWorkout != null || source.pendingUploads.isNotEmpty()),
                conflictDrafts = source.conflictDrafts + replay.conflicts,
                syncError = replay.conflicts.firstOrNull()?.reason,
            )
        }
        return applied
    }

    suspend fun applyOperationResult(result: ActiveWorkoutResultDto): Boolean {
        var handled = false
        store.updateData { current ->
            if (result.coordinatorEpoch != current.coordinatorEpoch) return@updateData current
            if (result.deviceId != current.installationId) return@updateData current
            handled = true
            val operationId = result.operationId ?: return@updateData current
            val mutation = current.pendingMutations.firstOrNull { it.operationId == operationId }
                ?: return@updateData current
            if (mutation.deviceId != result.deviceId || mutation.deviceSequence != result.deviceSequence) {
                return@updateData current.copy(syncError = "result_envelope_mismatch")
            }
            when (result.status) {
                "accepted" -> current.copy(
                    acceptedAwaitingCanonical = if (current.canonicalRevision >= result.canonicalRevision) {
                        current.acceptedAwaitingCanonical
                    } else (current.acceptedAwaitingCanonical + result).distinctBy { it.operationId },
                    pendingMutations = if (current.canonicalRevision >= result.canonicalRevision) {
                        current.pendingMutations.filterNot { it.operationId == operationId }
                    } else current.pendingMutations,
                    pendingUploads = if (current.canonicalRevision >= result.canonicalRevision) {
                        current.pendingUploads.map { pending ->
                            val metadata = pending.payload.activeSync
                            if (metadata?.finishOperationId != operationId) pending else {
                                val terminal = result.terminalWorkout ?: current.canonicalState?.workout
                                if (terminal?.endedAt == null) pending else {
                                    val normalized = terminal.toActiveWorkout().toPayload(terminal.endedAt)
                                    pending.copy(payload = normalized.copy(activeSync = metadata.copy(
                                        canonicalRevision = result.canonicalRevision,
                                        provisional = false,
                                        payloadHash = sha256(normalizedActiveWorkoutJson(syncJson.encodeToString(WorkoutPayloadDto.serializer(), normalized))),
                                    )))
                                }
                            }
                        }
                    } else current.pendingUploads,
                    syncError = null,
                )
                "rejected", "needs_resolution", "blocked_by_predecessor" -> current.copy(
                    rejectedMutations = (current.rejectedMutations + result).distinctBy { it.operationId },
                    conflictDrafts = if (current.conflictDrafts.any { it.rootOperationId == operationId }) {
                        current.conflictDrafts
                    } else current.conflictDrafts + ConflictDraft(
                        rootOperationId = operationId,
                        workout = current.activeWorkout ?: current.pendingTerminal,
                        reason = result.reason ?: result.status,
                    ),
                    syncError = result.reason ?: result.status,
                )
                "resolved" -> {
                    val canonicalKept = result.resolution == "canonical_kept"
                    val discardedIds = if (canonicalKept) {
                        val ids = mutableSetOf(operationId)
                        var changed: Boolean
                        do {
                            changed = false
                            current.pendingMutations.forEach { pending ->
                                if (pending.predecessorOperationId in ids && ids.add(pending.operationId)) changed = true
                            }
                        } while (changed)
                        ids
                    } else setOf(operationId)
                    val remaining = current.pendingMutations.filterNot { it.operationId in discardedIds }
                    val replay = if (canonicalKept) {
                        val canonicalWorkout = current.canonicalState
                            ?.takeIf { it.lifecycle == "active" }
                            ?.workout
                            ?.toActiveWorkout()
                        replayMutations(canonicalWorkout, remaining)
                    } else null
                    current.copy(
                        activeWorkout = if (canonicalKept) replay?.workout else current.activeWorkout,
                        pendingMutations = remaining,
                        rejectedMutations = current.rejectedMutations.filterNot { it.operationId in discardedIds },
                        conflictDrafts = current.conflictDrafts.filterNot { it.rootOperationId in discardedIds } +
                            (replay?.conflicts ?: emptyList()),
                        recoveryDraft = if (mutation.operation is RecoverWorkoutOperation || canonicalKept) null else current.recoveryDraft,
                        syncError = replay?.conflicts?.firstOrNull()?.reason,
                    )
                }
                else -> current.copy(syncError = "unknown_result_status")
            }
        }
        return handled
    }

    private suspend fun updateSet(
        setId: String,
        operations: List<dev.bishnoi.forgelog.wear.sync.ActiveWorkoutOperation>,
        transform: (ActiveLoggedSet) -> ActiveLoggedSet,
    ) {
        updateActive({ workout ->
            var found = false
            val exercises = workout.exercises.map { exercise ->
                exercise.copy(sets = exercise.sets.map { set ->
                    if (set.id == setId) {
                        found = true
                        transform(set)
                    } else set
                })
            }
            require(found) { "Set not found: $setId" }
            workout.copy(exercises = exercises)
        }) { before, after ->
            if (operations.isNotEmpty()) operations else {
                val updated = after.exercises.flatMap { it.sets }.first { it.id == setId }
                listOf(UpdateSetOperation(setId, "set_type", JsonPrimitive(updated.setType)))
            }
        }
    }

    private suspend fun updateActive(
        transform: (ActiveWorkout) -> ActiveWorkout,
        operations: (ActiveWorkout, ActiveWorkout) -> List<dev.bishnoi.forgelog.wear.sync.ActiveWorkoutOperation> = { _, _ -> emptyList() },
    ) {
        store.updateData { current ->
            val workout = requireNotNull(current.activeWorkout) { "No active workout" }
            val updated = transform(workout)
            current.withOptimisticMutations(updated, operations(workout, updated))
        }
    }

    private fun WorkoutState.withOptimisticMutation(
        workout: ActiveWorkout,
        operation: dev.bishnoi.forgelog.wear.sync.ActiveWorkoutOperation,
    ): WorkoutState {
        return withOptimisticMutations(workout, listOf(operation))
    }

    private fun WorkoutState.withOptimisticMutations(
        workout: ActiveWorkout,
        operations: List<dev.bishnoi.forgelog.wear.sync.ActiveWorkoutOperation>,
    ): WorkoutState {
        val epoch = coordinatorEpoch
        if (legacyMode || epoch == null || operations.isEmpty()) return copy(activeWorkout = workout)
        val deviceId = installationId ?: newId()
        var sequence = nextDeviceSequence
        var predecessor = pendingMutations.lastOrNull { it.workoutId == workout.id }?.operationId
        val appended = operations.map { operation ->
            val operationId = newId()
            val mutation = ActiveWorkoutMutationDto(
                operationId = operationId,
                deviceId = deviceId,
                deviceSequence = sequence++,
                coordinatorEpoch = epoch,
                workoutId = workout.id,
                baseRevision = canonicalRevision,
                predecessorOperationId = predecessor,
                conflictKeys = deriveConflictKeys(operation, workout.id),
                createdAt = now().toString(),
                operation = operation,
            )
            predecessor = operationId
            assertActiveWorkoutPayloadSize(syncJson.encodeToString(ActiveWorkoutMutationDto.serializer(), mutation))
            mutation
        }
        return copy(
            activeWorkout = workout,
            installationId = deviceId,
            nextDeviceSequence = sequence,
            pendingMutations = pendingMutations + appended,
        )
    }

    private fun WorkoutState.withIdentityIfNeeded(): WorkoutState {
        if (legacyMode || coordinatorEpoch == null || installationId != null) return this
        return copy(installationId = newId())
    }
}

private data class ReplayOutcome(
    val workout: ActiveWorkout?,
    val conflicts: List<ConflictDraft>,
)

private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { "%02x".format(it) }

private fun replayMutations(
    canonical: ActiveWorkout?,
    mutations: List<ActiveWorkoutMutationDto>,
): ReplayOutcome {
    var workout = canonical
    val conflicts = mutableListOf<ConflictDraft>()
    for (mutation in mutations.sortedBy { it.deviceSequence }) {
        try {
            workout = replayOperation(workout, mutation)
        } catch (error: IllegalArgumentException) {
            conflicts += ConflictDraft(
                rootOperationId = mutation.operationId,
                workout = workout,
                reason = error.message ?: "optimistic_replay_conflict",
            )
        }
    }
    return ReplayOutcome(workout, conflicts)
}

private fun replayOperation(
    workout: ActiveWorkout?,
    mutation: ActiveWorkoutMutationDto,
): ActiveWorkout? = when (val operation = mutation.operation) {
    is StartWorkoutOperation -> {
        val incoming = operation.workout.toActiveWorkout()
        if (workout == null || workout == incoming) incoming else throw IllegalArgumentException("independent_active_workout")
    }
    is RecoverWorkoutOperation -> {
        val incoming = operation.workout?.toActiveWorkout()
        if (workout == null || workout == incoming) incoming else throw IllegalArgumentException("recovery_requires_resolution")
    }
    is RenameWorkoutOperation -> requireWorkout(workout, mutation).copy(name = operation.name)
    is UpdateWorkoutNotesOperation -> requireWorkout(workout, mutation).copy(notes = operation.notes)
    is AddExerciseOperation -> {
        val current = requireWorkout(workout, mutation)
        val incoming = operation.exercise.toActiveExercise()
        val existing = current.exercises.firstOrNull { it.id == incoming.id }
        when {
            existing == incoming -> current
            existing != null -> throw IllegalArgumentException("entity_mismatch")
            else -> current.copy(exercises = (current.exercises + incoming).sortedBy { it.position }.mapIndexed { index, item -> item.copy(position = index) })
        }
    }
    is RemoveExerciseOperation -> {
        val current = requireWorkout(workout, mutation)
        current.copy(exercises = current.exercises.filterNot { it.id == operation.exerciseId }.mapIndexed { index, item -> item.copy(position = index) })
    }
    is ReorderExercisesOperation -> {
        val current = requireWorkout(workout, mutation)
        require(operation.exerciseIds.toSet() == current.exercises.map { it.id }.toSet()) { "membership_mismatch" }
        val byId = current.exercises.associateBy { it.id }
        current.copy(exercises = operation.exerciseIds.mapIndexed { index, id -> requireNotNull(byId[id]).copy(position = index) })
    }
    is UpdateExerciseOperation -> {
        val current = requireWorkout(workout, mutation)
        require(current.exercises.any { it.id == operation.exerciseId }) { "missing_entity" }
        current.copy(exercises = current.exercises.map { exercise ->
            if (exercise.id != operation.exerciseId) exercise else when (operation.field) {
                "notes" -> exercise.copy(notes = operation.value)
                "exercise_type" -> exercise.copy(exerciseType = requireNotNull(operation.value))
                "superset_group_id" -> exercise.copy(supersetGroupId = operation.value)
                else -> throw IllegalArgumentException("unsupported_field")
            }
        })
    }
    is AddSetOperation -> mapExercise(requireWorkout(workout, mutation), operation.exerciseId) { exercise ->
        val incoming = operation.set.toActiveSet()
        val existing = exercise.sets.firstOrNull { it.id == incoming.id }
        when {
            existing == incoming -> exercise
            existing != null -> throw IllegalArgumentException("entity_mismatch")
            else -> exercise.copy(sets = (exercise.sets + incoming).sortedBy { it.position }.mapIndexed { index, item -> item.copy(position = index) })
        }
    }
    is RemoveSetOperation -> mapExercise(requireWorkout(workout, mutation), operation.exerciseId) { exercise ->
        exercise.copy(sets = exercise.sets.filterNot { it.id == operation.setId }.mapIndexed { index, item -> item.copy(position = index) })
    }
    is ReorderSetsOperation -> mapExercise(requireWorkout(workout, mutation), operation.exerciseId) { exercise ->
        require(operation.setIds.toSet() == exercise.sets.map { it.id }.toSet()) { "membership_mismatch" }
        val byId = exercise.sets.associateBy { it.id }
        exercise.copy(sets = operation.setIds.mapIndexed { index, id -> requireNotNull(byId[id]).copy(position = index) })
    }
    is UpdateSetOperation -> mapSet(requireWorkout(workout, mutation), operation.setId) { set ->
        val value = operation.value as? JsonPrimitive
        when (operation.field) {
            "weight" -> set.copy(weight = value?.doubleOrNull)
            "reps" -> set.copy(reps = value?.intOrNull)
            "duration_seconds" -> set.copy(durationSeconds = value?.intOrNull)
            "distance_meters" -> set.copy(distanceMeters = value?.doubleOrNull)
            "rpe" -> set.copy(rpe = value?.doubleOrNull)
            "set_type" -> set.copy(setType = requireNotNull(value?.contentOrNull))
            else -> throw IllegalArgumentException("unsupported_field")
        }
    }
    is CompleteSetOperation -> mapExercise(requireWorkout(workout, mutation), operation.exerciseId) { exercise ->
        require(exercise.sets.any { it.id == operation.setId }) { "missing_entity" }
        exercise.copy(
            alertedRecordTypes = exercise.alertedRecordTypes + operation.alertedRecordTypes,
            sets = exercise.sets.map { set -> if (set.id == operation.setId) set.copy(completed = operation.completed, completedAt = operation.completedAt) else set },
        )
    }
    is FinishWorkoutOperation, is DiscardWorkoutOperation -> null
}

private fun requireWorkout(workout: ActiveWorkout?, mutation: ActiveWorkoutMutationDto): ActiveWorkout {
    require(workout?.id == mutation.workoutId) { "active_workout_mismatch" }
    return workout
}

private fun mapExercise(
    workout: ActiveWorkout,
    exerciseId: String,
    transform: (ActiveWorkoutExercise) -> ActiveWorkoutExercise,
): ActiveWorkout {
    require(workout.exercises.any { it.id == exerciseId }) { "missing_parent" }
    return workout.copy(exercises = workout.exercises.map { if (it.id == exerciseId) transform(it) else it })
}

private fun mapSet(
    workout: ActiveWorkout,
    setId: String,
    transform: (ActiveLoggedSet) -> ActiveLoggedSet,
): ActiveWorkout {
    var found = false
    val updated = workout.copy(exercises = workout.exercises.map { exercise ->
        exercise.copy(sets = exercise.sets.map { set ->
            if (set.id == setId) { found = true; transform(set) } else set
        })
    })
    require(found) { "missing_entity" }
    return updated
}

private fun Throwable.rethrowIfCancellation() {
    if (this is CancellationException) throw this
}

private fun ActiveWorkout.toPayload(endedAt: String) = WorkoutPayloadDto(
    id = id,
    routineId = routineId,
    name = name,
    startedAt = startedAt,
    endedAt = endedAt,
    exercises = exercises.sortedBy { it.position }.map { exercise ->
        WorkoutExercisePayloadDto(
            id = exercise.id,
            exerciseId = exercise.exerciseId,
            position = exercise.position,
            supersetGroupId = exercise.supersetGroupId,
            exerciseType = exercise.exerciseType,
            sets = exercise.sets.sortedBy { it.position }.map { set ->
                LoggedSetPayloadDto(
                    id = set.id,
                    workoutExerciseId = exercise.id,
                    position = set.position,
                    setType = set.setType,
                    weight = set.weight,
                    reps = set.reps,
                    durationSeconds = set.durationSeconds,
                    distanceMeters = set.distanceMeters,
                    rpe = set.rpe,
                    completed = set.completed,
                    completedAt = set.completedAt,
                )
            },
        )
    },
)

private fun ActiveWorkout.toProtocolSnapshot() = ActiveWorkoutSnapshotDto(
    id = id,
    routineId = routineId,
    name = name,
    startedAt = startedAt,
    endedAt = endedAt,
    notes = notes,
    bodyweightKg = bodyweightKg,
    routineStructureVersion = routineStructureVersion,
    exercises = exercises.map { exercise ->
        ActiveWorkoutExerciseDto(
            id = exercise.id,
            exerciseId = exercise.exerciseId,
            exerciseName = exercise.exerciseName,
            position = exercise.position,
            exerciseType = exercise.exerciseType,
            notes = exercise.notes,
            sourceRoutineExerciseId = exercise.sourceRoutineExerciseId,
            supersetGroupId = exercise.supersetGroupId,
            prBaselines = exercise.initialRecords,
            alertedRecordTypes = exercise.alertedRecordTypes,
            sets = exercise.sets.map { set ->
                ActiveWorkoutSetDto(
                    id = set.id,
                    sourceRoutineSetId = set.sourceRoutineSetId,
                    position = set.position,
                    setType = set.setType,
                    weight = set.weight,
                    reps = set.reps,
                    durationSeconds = set.durationSeconds,
                    distanceMeters = set.distanceMeters,
                    rpe = set.rpe,
                    completed = set.completed,
                    completedAt = set.completedAt,
                )
            },
        )
    },
)

private fun ActiveLoggedSet.toProtocolSet() = ActiveWorkoutSetDto(
    id = id,
    sourceRoutineSetId = sourceRoutineSetId,
    position = position,
    setType = setType,
    weight = weight,
    reps = reps,
    durationSeconds = durationSeconds,
    distanceMeters = distanceMeters,
    rpe = rpe,
    completed = completed,
    completedAt = completedAt,
)

private fun ActiveWorkoutSnapshotDto.toActiveWorkout() = ActiveWorkout(
    id = id,
    routineId = routineId,
    name = name,
    startedAt = startedAt,
    endedAt = endedAt,
    notes = notes,
    bodyweightKg = bodyweightKg,
    routineStructureVersion = routineStructureVersion,
    exercises = exercises.map { it.toActiveExercise() },
)

private fun ActiveWorkoutExerciseDto.toActiveExercise() = ActiveWorkoutExercise(
    id = id,
    exerciseId = exerciseId,
    exerciseName = exerciseName,
    position = position,
    exerciseType = exerciseType,
    notes = notes,
    sourceRoutineExerciseId = sourceRoutineExerciseId,
    supersetGroupId = supersetGroupId,
    initialRecords = prBaselines,
    alertedRecordTypes = alertedRecordTypes,
    sets = sets.map { it.toActiveSet() },
)

private fun ActiveWorkoutSetDto.toActiveSet() = ActiveLoggedSet(
    id = id,
    sourceRoutineSetId = sourceRoutineSetId,
    position = position,
    setType = setType,
    weight = weight,
    reps = reps,
    durationSeconds = durationSeconds,
    distanceMeters = distanceMeters,
    rpe = rpe,
    completed = completed,
    completedAt = completedAt,
)
