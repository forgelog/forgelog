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
    val pendingUploads: Flow<List<PendingWorkout>> = state.map { it.pendingUploads }

    suspend fun startWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var started: ActiveWorkout? = null
        store.updateData { current ->
            current.activeWorkout?.let { throw ActiveWorkoutExistsException(it.id) }
            val workout = createWorkout(routineId, name)
            started = workout
            current.copy(activeWorkout = workout)
        }
        return requireNotNull(started)
    }

    suspend fun startOrResumeWorkout(routineId: String, name: String? = null): ActiveWorkout {
        var selected: ActiveWorkout? = null
        store.updateData { current ->
            val workout = current.activeWorkout ?: createWorkout(routineId, name)
            selected = workout
            if (current.activeWorkout == null) current.copy(activeWorkout = workout) else current
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
            current.copy(activeWorkout = workout.copy(exercises = exercises))
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
            current.copy(activeWorkout = workout.copy(exercises = exercises))
        }
        return requireNotNull(added)
    }

    suspend fun removeSet(setId: String) {
        updateActive { workout ->
            var found = false
            val exercises = workout.exercises.map { exercise ->
                if (exercise.sets.any { it.id == setId }) found = true
                exercise.copy(sets = exercise.sets.filterNot { it.id == setId })
            }
            require(found) { "Set not found: $setId" }
            workout.copy(exercises = exercises)
        }
    }

    suspend fun deleteExercise(workoutExerciseId: String) {
        updateActive { workout ->
            require(workout.exercises.any { it.id == workoutExerciseId }) {
                "Workout exercise not found: $workoutExerciseId"
            }
            workout.copy(exercises = workout.exercises.filterNot { it.id == workoutExerciseId })
        }
    }

    suspend fun discardWorkout(workoutId: String) {
        store.updateData { current ->
            require(current.activeWorkout?.id == workoutId) { "Active workout not found: $workoutId" }
            current.copy(activeWorkout = null)
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
            val finished = workout.toPayload(now().toString())
            payload = finished
            val pending = current.pendingUploads.filterNot { it.payload.id == workoutId } +
                PendingWorkout(finished, now().toEpochMilli())
            current.copy(activeWorkout = null, pendingUploads = pending)
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
            current.copy(pendingUploads = current.pendingUploads.filterNot { it.payload.id == workoutId })
        }
    }

    suspend fun currentActiveWorkout(): ActiveWorkout? = state.first().activeWorkout

    private suspend fun updateSet(setId: String, transform: (ActiveLoggedSet) -> ActiveLoggedSet) {
        updateActive { workout ->
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
        }
    }

    private suspend fun updateActive(transform: (ActiveWorkout) -> ActiveWorkout) {
        store.updateData { current ->
            val workout = requireNotNull(current.activeWorkout) { "No active workout" }
            current.copy(activeWorkout = transform(workout))
        }
    }
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
