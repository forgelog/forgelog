package com.forgelog.wear.data

import com.forgelog.wear.logic.effectiveTrackingType
import com.forgelog.wear.logic.newId
import java.time.Instant

/**
 * Ports apps/mobile/src/db/repositories/workouts.ts startWorkout: copies a
 * routine's exercises/sets into a new session, snapshotting the effective
 * tracking_type and rest_seconds so later routine edits never rewrite a
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
        val resolvedName = name ?: routine?.name ?: "Workout"
        val routineExercises = if (routineId != null) referenceDao.routineExercises(routineId) else emptyList()

        val workout = WorkoutEntity(
            id = workoutId,
            routineId = routineId,
            name = resolvedName,
            startedAt = startedAt,
            endedAt = null,
            synced = false,
        )
        workoutDao.insertWorkout(workout)

        for (re in routineExercises) {
            val exercise = referenceDao.exercise(re.exerciseId)
            val weId = newId()
            workoutDao.insertWorkoutExercise(
                WorkoutExerciseEntity(
                    id = weId,
                    workoutId = workoutId,
                    exerciseId = re.exerciseId,
                    position = re.position,
                    supersetGroupId = re.supersetGroupId,
                    trackingType = effectiveTrackingType(re.trackingType, exercise?.trackingType).value,
                    restSeconds = re.restSeconds,
                )
            )
            for (set in referenceDao.routineSets(re.id)) {
                workoutDao.insertLoggedSet(
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
                )
            }
        }

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
}
