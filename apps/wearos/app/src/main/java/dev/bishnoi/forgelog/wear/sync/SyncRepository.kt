package dev.bishnoi.forgelog.wear.sync

import dev.bishnoi.forgelog.wear.data.ExerciseEntity
import dev.bishnoi.forgelog.wear.data.PersonalRecordEntity
import dev.bishnoi.forgelog.wear.data.ReferenceDao
import dev.bishnoi.forgelog.wear.data.RoutineEntity
import dev.bishnoi.forgelog.wear.data.RoutineExerciseEntity
import dev.bishnoi.forgelog.wear.data.RoutineSetEntity
import dev.bishnoi.forgelog.wear.data.WorkoutDao
import dev.bishnoi.forgelog.wear.data.WorkoutEntity

/**
 * Applies a phone SyncSnapshot into the watch's reference tables, and builds
 * the JSON payload for the watch -> phone WAL flush. Kept separate from
 * WorkoutRepository since one direction is phone-authoritative (reference
 * data) and the other is watch-authoritative (session data).
 */
class SyncRepository(
    private val referenceDao: ReferenceDao,
    private val workoutDao: WorkoutDao,
) {
    suspend fun applySnapshot(snapshot: SyncSnapshot) {
        val exercises = mutableMapOf<String, ExerciseDto>()
        val routines = mutableListOf<RoutineEntity>()
        val routineExercises = mutableListOf<RoutineExerciseEntity>()
        val routineSets = mutableListOf<RoutineSetEntity>()

        for (routine in snapshot.routines) {
            routines += RoutineEntity(routine.id, routine.name, routine.position)
            for (re in routine.exercises) {
                exercises[re.exercise.id] = re.exercise
                routineExercises += RoutineExerciseEntity(
                    id = re.id,
                    routineId = re.routineId,
                    exerciseId = re.exerciseId,
                    position = re.position,
                    supersetGroupId = re.supersetGroupId,
                    restSeconds = re.restSeconds,
                    trackingType = re.trackingType,
                )
                for (s in re.sets) {
                    routineSets += RoutineSetEntity(
                        id = s.id,
                        routineExerciseId = s.routineExerciseId,
                        position = s.position,
                        setType = s.setType,
                        targetWeight = s.targetWeight,
                        targetReps = s.targetReps,
                        targetDurationSeconds = s.targetDurationSeconds,
                        targetDistanceMeters = s.targetDistanceMeters,
                    )
                }
            }
        }

        referenceDao.upsertExercises(exercises.values.map { ExerciseEntity(it.id, it.name, it.trackingType) })
        referenceDao.upsertRoutines(routines)
        referenceDao.upsertRoutineExercises(routineExercises)
        referenceDao.upsertRoutineSets(routineSets)
        referenceDao.upsertPersonalRecords(
            snapshot.personalRecords.map {
                PersonalRecordEntity(it.id, it.exerciseId, it.recordType, it.value, it.achievedAt)
            }
        )
    }

    suspend fun buildWorkoutPayload(workout: WorkoutEntity): WorkoutPayloadDto {
        val exercises = workoutDao.workoutExercises(workout.id).map { we ->
            WorkoutExercisePayloadDto(
                id = we.id,
                exerciseId = we.exerciseId,
                position = we.position,
                supersetGroupId = we.supersetGroupId,
                trackingType = we.trackingType,
                restSeconds = we.restSeconds,
                sets = workoutDao.loggedSets(we.id).map { s ->
                    LoggedSetPayloadDto(
                        id = s.id,
                        workoutExerciseId = s.workoutExerciseId,
                        position = s.position,
                        setType = s.setType,
                        weight = s.weight,
                        reps = s.reps,
                        durationSeconds = s.durationSeconds,
                        distanceMeters = s.distanceMeters,
                        rpe = s.rpe,
                        completed = s.completed,
                        completedAt = s.completedAt,
                    )
                },
            )
        }
        return WorkoutPayloadDto(
            id = workout.id,
            routineId = workout.routineId,
            name = workout.name,
            startedAt = workout.startedAt,
            endedAt = workout.endedAt,
            exercises = exercises,
        )
    }
}
