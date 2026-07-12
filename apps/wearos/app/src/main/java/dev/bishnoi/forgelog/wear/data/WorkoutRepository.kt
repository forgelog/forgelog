package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.logic.requireExerciseType
import dev.bishnoi.forgelog.wear.logic.newId
import dev.bishnoi.forgelog.wear.logic.nextSetType
import java.time.Instant

/**
 * Ports apps/mobile/src/db/repositories/workouts.ts startWorkout: copies a
 * routine's exercises/sets into a new session, snapshotting the routine
 * exercise_type and rest_seconds so later routine edits never rewrite a
 * logged workout. Writes to Room instead of SQLite — the watch's local WAL.
 */
class WorkoutRepository(
    private val workoutDao: WorkoutDao,
    private val referenceDao: ReferenceDao,
) {
    suspend fun startWorkout(routineId: String?, name: String? = null): WorkoutEntity {
        val startedAt = Instant.now().toString()
        val workoutId = newId()

        val routine = routineId?.let { referenceDao.routine(it) }
        val resolvedName = when {
            name != null -> name
            routine != null -> routine.name
            else -> "Workout"
        }
        val routineExercises = if (routineId != null) referenceDao.routineExercises(routineId) else emptyList()
        val sessionExercises = routineExercises.map { re ->
            val exerciseType = requireExerciseType(re.exerciseType)
            val weId = newId()
            val loggedSets = referenceDao.routineSets(re.id).map { set ->
                LoggedSetEntity(
                    id = newId(),
                    workoutExerciseId = weId,
                    position = set.position,
                    setType = set.setType,
                    weight = set.targetWeight,
                    reps = set.targetReps,
                    durationSeconds = set.targetDurationSeconds,
                    distanceMeters = set.targetDistanceMeters,
                    rpe = null,
                    completed = false,
                    completedAt = null,
                )
            }
            WorkoutExerciseEntity(
                id = weId,
                workoutId = workoutId,
                exerciseId = re.exerciseId,
                position = re.position,
                supersetGroupId = re.supersetGroupId,
                exerciseType = exerciseType.value,
                restSeconds = re.restSeconds,
            ) to loggedSets
        }

        val workout = WorkoutEntity(
            id = workoutId,
            routineId = routineId,
            name = resolvedName,
            startedAt = startedAt,
            endedAt = null,
            synced = false,
        )
        workoutDao.insertWorkoutSession(
            workout = workout,
            workoutExercises = sessionExercises.map { it.first },
            loggedSets = sessionExercises.flatMap { it.second },
        )

        return workout
    }

    suspend fun finishWorkout(workoutId: String) {
        val workout = workoutDao.getWorkout(workoutId) ?: return
        workoutDao.updateWorkout(workout.copy(endedAt = Instant.now().toString(), synced = false))
    }

    suspend fun markSetCompleted(loggedSet: LoggedSetEntity, completed: Boolean) {
        workoutDao.updateLoggedSet(
            loggedSet.copy(
                completed = completed,
                completedAt = if (completed) Instant.now().toString() else null,
            )
        )
    }

    suspend fun updateSetValues(loggedSet: LoggedSetEntity, weight: Double?, reps: Int?) {
        workoutDao.updateLoggedSet(loggedSet.copy(weight = weight, reps = reps))
    }

    suspend fun updateSetDuration(loggedSet: LoggedSetEntity, durationSeconds: Int?) {
        workoutDao.updateLoggedSet(loggedSet.copy(durationSeconds = durationSeconds))
    }

    suspend fun updateSetDistance(loggedSet: LoggedSetEntity, distanceMeters: Double?) {
        workoutDao.updateLoggedSet(loggedSet.copy(distanceMeters = distanceMeters))
    }

    suspend fun addSet(workoutExerciseId: String): LoggedSetEntity {
        val set = LoggedSetEntity(
            id = newId(),
            workoutExerciseId = workoutExerciseId,
            position = workoutDao.nextSetPosition(workoutExerciseId),
            setType = "normal",
            weight = null,
            reps = null,
            durationSeconds = null,
            distanceMeters = null,
            rpe = null,
            completed = false,
            completedAt = null,
        )
        workoutDao.insertLoggedSet(set)
        return set
    }

    suspend fun removeSet(loggedSetId: String) {
        workoutDao.deleteLoggedSet(loggedSetId)
    }

    suspend fun cycleSetType(loggedSet: LoggedSetEntity) {
        workoutDao.updateLoggedSet(loggedSet.copy(setType = nextSetType(loggedSet.setType)))
    }

    /**
     * Discards an in-progress workout entirely. Mirrors
     * apps/mobile/src/db/repositories/workouts.ts deleteWorkout (a hard DELETE,
     * not a soft flag), so a discarded session never enters the sync WAL.
     */
    suspend fun discardWorkout(workoutId: String) {
        workoutDao.deleteWorkoutCascade(workoutId)
    }

    suspend fun deleteExercise(workoutExerciseId: String) {
        workoutDao.deleteExerciseCascade(workoutExerciseId)
    }
}
