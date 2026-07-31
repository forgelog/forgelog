package dev.bishnoi.forgelog.wear.data

import dev.bishnoi.forgelog.wear.logic.selectCurrentGeneration
import dev.bishnoi.forgelog.wear.sync.AuthoredWorkoutReplica
import dev.bishnoi.forgelog.wear.sync.WorkoutMailbox
import dev.bishnoi.forgelog.wear.sync.WorkoutReplica
import dev.bishnoi.forgelog.wear.sync.WorkoutReplicaState
import java.time.Instant
import kotlinx.serialization.Serializable

const val WORKOUT_STATE_FORMAT_VERSION = 2

@Serializable
data class WorkoutState(
    val formatVersion: Int = WORKOUT_STATE_FORMAT_VERSION,
    val resolvedReplicas: List<AuthoredWorkoutReplica> = emptyList(),
    val pendingFinished: List<WorkoutReplica> = emptyList(),
    val transportIntent: WorkoutReplica? = null,
    val desiredMailbox: WorkoutMailbox = WorkoutMailbox(),
    val uiOverlay: WorkoutUiOverlay = WorkoutUiOverlay(),
) {
    val activeWorkout: ActiveWorkout?
        get() {
            val current = selectCurrentGeneration(resolvedReplicas) ?: return null
            val active = current.replica.state as? WorkoutReplicaState.Active ?: return null
            val fields = active.workout.fields
            return ActiveWorkout(
                id = current.replica.workoutId,
                routineId = fields.routineId.value,
                name = fields.name.value,
                startedAt = Instant.ofEpochMilli(current.replica.startedAtMs).toString(),
                exercises = active.workout.exercises
                    .filter { !it.deleted && it.position != null && it.value != null }
                    .sortedWith(compareBy({ it.position }, { it.id }))
                    .map { exercise ->
                        val value = requireNotNull(exercise.value)
                        ActiveWorkoutExercise(
                            id = exercise.id,
                            exerciseId = value.exerciseId,
                            exerciseName = value.exerciseName,
                            position = requireNotNull(exercise.position),
                            supersetGroupId = value.supersetGroupId,
                            exerciseType = value.exerciseType,
                            initialRecords = uiOverlay.initialRecords[exercise.id].orEmpty(),
                            alertedRecordTypes = uiOverlay.alertedRecordTypes[exercise.id].orEmpty(),
                            sets = exercise.sets
                                .filter { !it.deleted && it.position != null && it.value != null }
                                .sortedWith(compareBy({ it.position }, { it.id }))
                                .map { set ->
                                    val setValue = requireNotNull(set.value)
                                    ActiveLoggedSet(
                                        id = set.id,
                                        position = requireNotNull(set.position),
                                        setType = setValue.setType,
                                        weight = setValue.weight,
                                        reps = setValue.reps,
                                        durationSeconds = setValue.durationSeconds,
                                        distanceMeters = setValue.distanceMeters,
                                        rpe = setValue.rpe,
                                        completed = setValue.completed,
                                        completedAt = setValue.completedAtMs?.let {
                                            Instant.ofEpochMilli(it).toString()
                                        },
                                    )
                                },
                        )
                    },
            )
        }
}

@Serializable
data class WorkoutUiOverlay(
    val initialRecords: Map<String, Map<String, Double>> = emptyMap(),
    val alertedRecordTypes: Map<String, Set<String>> = emptyMap(),
)

data class ActiveWorkout(
    val id: String,
    val routineId: String?,
    val name: String,
    val startedAt: String,
    val exercises: List<ActiveWorkoutExercise>,
)

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
)

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
)
