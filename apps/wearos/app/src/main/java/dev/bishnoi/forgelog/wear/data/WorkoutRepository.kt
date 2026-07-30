package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStore
import dev.bishnoi.forgelog.wear.logic.ExerciseType
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SetPerformance
import dev.bishnoi.forgelog.wear.logic.computeRecords
import dev.bishnoi.forgelog.wear.logic.materializeActiveWorkout
import dev.bishnoi.forgelog.wear.logic.newId
import dev.bishnoi.forgelog.wear.logic.nextSetType
import dev.bishnoi.forgelog.wear.logic.requireExerciseType
import dev.bishnoi.forgelog.wear.logic.resolveSameWorkout
import dev.bishnoi.forgelog.wear.logic.selectCurrentGeneration
import dev.bishnoi.forgelog.wear.logic.selectOutboundCandidate
import dev.bishnoi.forgelog.wear.sync.ActiveLoggedSet as ReplicaLoggedSet
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutBody
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutExercise as ReplicaWorkoutExercise
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutFields
import dev.bishnoi.forgelog.wear.sync.AuthoredWorkoutReplica
import dev.bishnoi.forgelog.wear.sync.EntryVersion
import dev.bishnoi.forgelog.wear.sync.LoggedSetFields
import dev.bishnoi.forgelog.wear.sync.VersionedLong
import dev.bishnoi.forgelog.wear.sync.VersionedNullableDouble
import dev.bishnoi.forgelog.wear.sync.VersionedNullableString
import dev.bishnoi.forgelog.wear.sync.VersionedString
import dev.bishnoi.forgelog.wear.sync.WorkoutExerciseFields
import dev.bishnoi.forgelog.wear.sync.WorkoutMailbox
import dev.bishnoi.forgelog.wear.sync.WorkoutReceipt
import dev.bishnoi.forgelog.wear.sync.WorkoutReplica
import dev.bishnoi.forgelog.wear.sync.WorkoutReplicaState
import dev.bishnoi.forgelog.wear.sync.WorkoutWriter
import dev.bishnoi.forgelog.wear.sync.receiptMatchesPendingFinish
import dev.bishnoi.forgelog.wear.sync.validateWorkoutMailbox
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

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
    val pendingFinished: Flow<List<WorkoutReplica>> = state.map { it.pendingFinished }

    suspend fun startWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var started: ActiveWorkout? = null
        store.updateData { current ->
            current.activeWorkout?.let { throw ActiveWorkoutExistsException(it.id) }
            val created = createWorkout(current, routineId, name)
            val next = current.copy(
                resolvedReplicas = current.resolvedReplicas.upsert(created.authored),
                transportIntent = created.authored.replica,
                uiOverlay = created.overlay,
            ).withDesiredMailbox()
            started = requireNotNull(next.activeWorkout)
            next
        }
        return requireNotNull(started)
    }

    suspend fun startOrResumeWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var selected: ActiveWorkout? = null
        store.updateData { current ->
            current.activeWorkout?.let {
                selected = it
                return@updateData current
            }
            val created = createWorkout(current, routineId, name)
            val next = current.copy(
                resolvedReplicas = current.resolvedReplicas.upsert(created.authored),
                transportIntent = created.authored.replica,
                uiOverlay = created.overlay,
            ).withDesiredMailbox()
            selected = requireNotNull(next.activeWorkout)
            next
        }
        return requireNotNull(selected)
    }

    private suspend fun createWorkout(
        current: WorkoutState,
        routineId: String,
        name: String?,
    ): CreatedWorkout {
        val reference = requireNotNull(references.workoutReference(routineId)) { "Routine not found: $routineId" }
        val routine = reference.routine
        val nowMs = now().toEpochMilli()
        val startedAtMs = maxOf(
            nowMs,
            (current.resolvedReplicas.maxOfOrNull { it.replica.startedAtMs } ?: -1L) + 1,
        )
        val entryVersion = EntryVersion(startedAtMs, WorkoutWriter.WATCH)
        val workoutId = newId()
        val initialRecords = mutableMapOf<String, Map<String, Double>>()
        val exercises = routine.exercises.sortedBy { it.position }.map { routineExercise ->
            val exerciseType = requireExerciseType(routineExercise.exerciseType)
            val workoutExerciseId = newId()
            initialRecords[workoutExerciseId] =
                reference.recordsByExercise[routineExercise.exerciseId].orEmpty()
            ReplicaWorkoutExercise(
                id = workoutExerciseId,
                version = entryVersion,
                deleted = false,
                position = routineExercise.position,
                value = WorkoutExerciseFields(
                    exerciseId = routineExercise.exerciseId,
                    exerciseName = routineExercise.exercise.name,
                    sourceRoutineExerciseId = routineExercise.id,
                    supersetGroupId = routineExercise.supersetGroupId,
                    exerciseType = exerciseType.value,
                    notes = null,
                ),
                sets = routineExercise.sets.sortedBy { it.position }.map { set ->
                    ReplicaLoggedSet(
                        id = newId(),
                        version = entryVersion,
                        deleted = false,
                        position = set.position,
                        value = LoggedSetFields(
                            sourceRoutineSetId = set.id,
                            setType = set.setType,
                            weight = set.targetWeight,
                            reps = set.targetReps,
                            durationSeconds = set.targetDurationSeconds,
                            distanceMeters = set.targetDistanceMeters,
                            completed = false,
                        ),
                    )
                }.sortedBy { it.id },
            )
        }.sortedBy { it.id }
        val profile = references.currentProfile()
        val replica = WorkoutReplica(
            workoutId = workoutId,
            startedAtMs = startedAtMs,
            changedAtMs = startedAtMs,
            state = WorkoutReplicaState.Active(
                ActiveWorkoutBody(
                    fields = ActiveWorkoutFields(
                        routineId = VersionedNullableString(entryVersion, routineId),
                        routineStructureVersion = VersionedLong(entryVersion, 1),
                        name = VersionedString(entryVersion, name ?: routine.name),
                        notes = VersionedNullableString(entryVersion, null),
                        bodyweightKg = VersionedNullableDouble(entryVersion, profile?.bodyweightKg),
                    ),
                    exercises = exercises,
                ),
            ),
        )
        return CreatedWorkout(
            AuthoredWorkoutReplica(WorkoutWriter.WATCH, replica),
            WorkoutUiOverlay(initialRecords = initialRecords),
        )
    }

    suspend fun updateSetValues(setId: String, weight: Double?, reps: Int?) {
        updateSet(setId) { it.copy(weight = weight, reps = reps) }
    }

    suspend fun updateSetDuration(setId: String, durationSeconds: Int?) {
        updateSet(setId) { it.copy(durationSeconds = durationSeconds) }
    }

    suspend fun updateSetDistance(setId: String, distanceMeters: Double?) {
        updateSet(setId) { it.copy(distanceMeters = distanceMeters) }
    }

    suspend fun cycleSetType(setId: String) {
        updateSet(setId) { it.copy(setType = nextSetType(it.setType)) }
    }

    suspend fun markSetCompleted(setId: String, completed: Boolean): List<RecordType> {
        var newlyAlerted = emptyList<RecordType>()
        updateActive { current, active, stamp ->
            var matchingExerciseId: String? = null
            val exercises = active.workout.exercises.map { exercise ->
                if (exercise.sets.none { it.id == setId && !it.deleted }) return@map exercise
                matchingExerciseId = exercise.id
                exercise.copy(sets = exercise.sets.map { set ->
                    if (set.id != setId || set.deleted) return@map set
                    set.copy(
                        version = stamp,
                        value = requireNotNull(set.value).copy(
                            completed = completed,
                            completedAtMs = if (completed) stamp.changedAtMs else null,
                        ),
                    )
                })
            }
            val exerciseId = requireNotNull(matchingExerciseId) { "Set not found: $setId" }
            var overlay = current.uiOverlay
            if (completed) {
                val exercise = exercises.first { it.id == exerciseId }
                val exerciseValue = requireNotNull(exercise.value)
                val exerciseType = ExerciseType.fromValue(exerciseValue.exerciseType)
                    ?: ExerciseType.WEIGHT_REPS
                val candidates = computeRecords(
                    exercise.sets.filter { !it.deleted && it.value?.completed == true }.map { set ->
                        val value = requireNotNull(set.value)
                        SetPerformance(value.weight, value.reps, exerciseType, value.setType)
                    },
                )
                val alreadyAlerted = overlay.alertedRecordTypes[exerciseId].orEmpty()
                val baseline = overlay.initialRecords[exerciseId].orEmpty()
                newlyAlerted = candidates.filter { (type, value) ->
                    baseline[type.value]?.let { value > it } == true && type.value !in alreadyAlerted
                }.keys.toList()
                overlay = overlay.copy(
                    alertedRecordTypes = overlay.alertedRecordTypes +
                        (exerciseId to (alreadyAlerted + newlyAlerted.map { it.value })),
                )
            }
            ActiveUpdate(ActiveWorkoutBody(active.workout.fields, exercises), overlay)
        }
        return newlyAlerted
    }

    suspend fun addSet(workoutExerciseId: String): ActiveLoggedSet {
        var added: ReplicaLoggedSet? = null
        updateActive { current, active, stamp ->
            var found = false
            val exercises = active.workout.exercises.map { exercise ->
                if (exercise.id != workoutExerciseId || exercise.deleted) return@map exercise
                found = true
                val set = ReplicaLoggedSet(
                    id = newId(),
                    version = stamp,
                    deleted = false,
                    position = (exercise.sets.filter { !it.deleted }.maxOfOrNull { it.position ?: -1 } ?: -1) + 1,
                    value = LoggedSetFields(setType = "normal", completed = false),
                )
                added = set
                exercise.copy(sets = (exercise.sets + set).sortedBy { it.id })
            }
            require(found) { "Workout exercise not found: $workoutExerciseId" }
            ActiveUpdate(ActiveWorkoutBody(active.workout.fields, exercises), current.uiOverlay)
        }
        val set = requireNotNull(added)
        val value = requireNotNull(set.value)
        return ActiveLoggedSet(
            id = set.id,
            position = requireNotNull(set.position),
            setType = value.setType,
            weight = value.weight,
            reps = value.reps,
            durationSeconds = value.durationSeconds,
            distanceMeters = value.distanceMeters,
            rpe = value.rpe,
            completed = value.completed,
            completedAt = value.completedAtMs?.let { Instant.ofEpochMilli(it).toString() },
        )
    }

    suspend fun removeSet(setId: String) {
        updateActive { current, active, stamp ->
            var found = false
            val exercises = active.workout.exercises.map { exercise ->
                exercise.copy(sets = exercise.sets.map { set ->
                    if (set.id != setId || set.deleted) return@map set
                    found = true
                    set.copy(version = stamp, deleted = true, position = null, value = null)
                })
            }
            require(found) { "Set not found: $setId" }
            ActiveUpdate(ActiveWorkoutBody(active.workout.fields, exercises), current.uiOverlay)
        }
    }

    suspend fun deleteExercise(workoutExerciseId: String) {
        updateActive { current, active, stamp ->
            var found = false
            val exercises = active.workout.exercises.map { exercise ->
                if (exercise.id != workoutExerciseId || exercise.deleted) return@map exercise
                found = true
                exercise.copy(version = stamp, deleted = true, position = null, value = null)
            }
            require(found) { "Workout exercise not found: $workoutExerciseId" }
            ActiveUpdate(
                ActiveWorkoutBody(active.workout.fields, exercises),
                current.uiOverlay.copy(
                    initialRecords = current.uiOverlay.initialRecords - workoutExerciseId,
                    alertedRecordTypes = current.uiOverlay.alertedRecordTypes - workoutExerciseId,
                ),
            )
        }
    }

    suspend fun discardWorkout(workoutId: String) {
        store.updateData { current ->
            val authored = current.currentActiveAuthored()
            require(authored?.replica?.workoutId == workoutId) { "Active workout not found: $workoutId" }
            val changedAt = nextStamp(authored.replica)
            val discarded = WorkoutReplica(
                workoutId = authored.replica.workoutId,
                startedAtMs = authored.replica.startedAtMs,
                changedAtMs = changedAt,
                state = WorkoutReplicaState.Discarded,
            )
            current.copy(
                resolvedReplicas = current.resolvedReplicas.upsert(
                    AuthoredWorkoutReplica(WorkoutWriter.WATCH, discarded),
                ),
                transportIntent = discarded,
                uiOverlay = WorkoutUiOverlay(),
            ).withDesiredMailbox()
        }
    }

    suspend fun finishWorkout(workoutId: String): WorkoutReplica {
        var result: WorkoutReplica? = null
        store.updateData { current ->
            val authored = current.currentActiveAuthored()
            if (authored?.replica?.workoutId != workoutId) {
                result = current.pendingFinished.firstOrNull { it.workoutId == workoutId }
                requireNotNull(result) { "Active or pending workout not found: $workoutId" }
                return@updateData current
            }
            val active = authored.replica.state as WorkoutReplicaState.Active
            val changedAt = nextStamp(authored.replica)
            val finished = WorkoutReplica(
                workoutId = authored.replica.workoutId,
                startedAtMs = authored.replica.startedAtMs,
                changedAtMs = changedAt,
                state = WorkoutReplicaState.Finished(
                    endedAtMs = changedAt,
                    workout = materializeActiveWorkout(active.workout),
                ),
            )
            result = finished
            current.copy(
                resolvedReplicas = current.resolvedReplicas.upsert(
                    AuthoredWorkoutReplica(WorkoutWriter.WATCH, finished),
                ),
                pendingFinished = current.pendingFinished.filterNot { it.workoutId == workoutId } + finished,
                transportIntent = current.transportIntent?.takeUnless { it.workoutId == workoutId },
                uiOverlay = WorkoutUiOverlay(),
            ).withDesiredMailbox()
        }
        return requireNotNull(result)
    }

    suspend fun consumeReceipt(receipt: WorkoutReceipt) {
        store.updateData { current ->
            val matching = current.pendingFinished.firstOrNull {
                it.workoutId == receipt.workoutId &&
                    it.startedAtMs == receipt.watchStartedAtMs &&
                    it.changedAtMs == receipt.watchChangedAtMs
            } ?: return@updateData current
            current.copy(pendingFinished = current.pendingFinished - matching).withDesiredMailbox()
        }
    }

    suspend fun applyPhoneMailbox(mailbox: WorkoutMailbox): Boolean {
        var accepted = false
        store.updateData { current ->
            val validated = validateWorkoutMailbox(
                WorkoutWriter.PHONE,
                mailbox,
                current.resolvedReplicas,
            ) ?: return@updateData current
            accepted = true
            val next = validated.candidate?.let { applyPhoneCandidate(current, it) } ?: current
            next.consumeWatchReceipt(validated.watchReceipt).withDesiredMailbox()
        }
        return accepted
    }

    private fun applyPhoneCandidate(current: WorkoutState, candidate: WorkoutReplica): WorkoutState {
        val incoming = AuthoredWorkoutReplica(WorkoutWriter.PHONE, candidate)
        val existing = current.resolvedReplicas.firstOrNull {
            it.replica.workoutId == candidate.workoutId
        }
        val resolved = existing?.let {
            resolveSameWorkout(
                it,
                incoming,
                WorkoutWriter.WATCH,
                maxOf(now().toEpochMilli(), it.replica.changedAtMs + 1, candidate.changedAtMs + 1),
            )
        } ?: incoming
        val next = current.copy(
            resolvedReplicas = current.resolvedReplicas.upsert(resolved),
            transportIntent = nextPhoneTransportIntent(current.transportIntent, existing, resolved, candidate),
        )
        return if (current.activeWorkout?.id == next.activeWorkout?.id) {
            next
        } else {
            next.copy(uiOverlay = WorkoutUiOverlay())
        }
    }

    private fun nextPhoneTransportIntent(
        intent: WorkoutReplica?,
        existing: AuthoredWorkoutReplica?,
        resolved: AuthoredWorkoutReplica,
        candidate: WorkoutReplica,
    ): WorkoutReplica? {
        if (resolved.writer == WorkoutWriter.PHONE && intent?.workoutId == candidate.workoutId) return null
        val watchJoinNeedsSending = existing != null &&
            resolved.writer == WorkoutWriter.WATCH &&
            resolved != existing &&
            (
                intent == null ||
                    intent.workoutId == candidate.workoutId ||
                    resolved.replica.generationIsAtLeast(intent)
                )
        return if (watchJoinNeedsSending) resolved.replica else intent
    }

    private fun WorkoutState.consumeWatchReceipt(receipt: WorkoutReceipt?): WorkoutState {
        if (receipt == null) return this
        val matching = pendingFinished.firstOrNull { receiptMatchesPendingFinish(receipt, it) }
            ?: return this
        return copy(pendingFinished = pendingFinished - matching)
    }

    suspend fun currentActiveWorkout(): ActiveWorkout? = state.first().activeWorkout

    private suspend fun updateSet(setId: String, transform: (LoggedSetFields) -> LoggedSetFields) {
        updateActive { current, active, stamp ->
            var found = false
            val exercises = active.workout.exercises.map { exercise ->
                exercise.copy(sets = exercise.sets.map { set ->
                    if (set.id != setId || set.deleted) return@map set
                    found = true
                    set.copy(version = stamp, value = transform(requireNotNull(set.value)))
                })
            }
            require(found) { "Set not found: $setId" }
            ActiveUpdate(ActiveWorkoutBody(active.workout.fields, exercises), current.uiOverlay)
        }
    }

    private suspend fun updateActive(
        transform: (WorkoutState, WorkoutReplicaState.Active, EntryVersion) -> ActiveUpdate,
    ) {
        store.updateData { current ->
            val authored = requireNotNull(current.currentActiveAuthored()) { "No active workout" }
            val active = authored.replica.state as WorkoutReplicaState.Active
            val stamp = EntryVersion(nextStamp(authored.replica), WorkoutWriter.WATCH)
            val update = transform(current, active, stamp)
            val replica = authored.replica.copy(
                changedAtMs = stamp.changedAtMs,
                state = WorkoutReplicaState.Active(
                    update.body.copy(
                        exercises = update.body.exercises.sortedBy { it.id }.map { exercise ->
                            exercise.copy(sets = exercise.sets.sortedBy { it.id })
                        },
                    ),
                ),
            )
            current.copy(
                resolvedReplicas = current.resolvedReplicas.upsert(
                    AuthoredWorkoutReplica(WorkoutWriter.WATCH, replica),
                ),
                transportIntent = replica,
                uiOverlay = update.overlay,
            ).withDesiredMailbox()
        }
    }

    private fun nextStamp(replica: WorkoutReplica): Long =
        maxOf(now().toEpochMilli(), replica.changedAtMs + 1)
}

private data class CreatedWorkout(
    val authored: AuthoredWorkoutReplica,
    val overlay: WorkoutUiOverlay,
)

private data class ActiveUpdate(
    val body: ActiveWorkoutBody,
    val overlay: WorkoutUiOverlay,
)

private fun WorkoutState.currentActiveAuthored(): AuthoredWorkoutReplica? {
    val current = selectCurrentGeneration(resolvedReplicas) ?: return null
    return current.takeIf { it.replica.state is WorkoutReplicaState.Active }
}

private fun List<AuthoredWorkoutReplica>.upsert(candidate: AuthoredWorkoutReplica): List<AuthoredWorkoutReplica> =
    (filterNot { it.replica.workoutId == candidate.replica.workoutId } + candidate)
        .sortedWith(compareBy({ it.replica.startedAtMs }, { it.replica.workoutId }))

private fun WorkoutState.withDesiredMailbox(): WorkoutState = copy(
    desiredMailbox = WorkoutMailbox(
        candidate = selectOutboundCandidate(WorkoutWriter.WATCH, pendingFinished, transportIntent),
        watchReceipt = null,
    ),
)

private fun WorkoutReplica.generationIsAtLeast(other: WorkoutReplica): Boolean =
    startedAtMs > other.startedAtMs ||
        (startedAtMs == other.startedAtMs && workoutId >= other.workoutId)

private fun Throwable.rethrowIfCancellation() {
    if (this is CancellationException) throw this
}
