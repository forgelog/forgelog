package dev.bishnoi.forgelog.wear.logic

import dev.bishnoi.forgelog.wear.sync.ActiveLoggedSet
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutBody
import dev.bishnoi.forgelog.wear.sync.ActiveWorkoutExercise
import dev.bishnoi.forgelog.wear.sync.AuthoredWorkoutReplica
import dev.bishnoi.forgelog.wear.sync.EntryVersion
import dev.bishnoi.forgelog.wear.sync.LoggedSetBody
import dev.bishnoi.forgelog.wear.sync.VersionedValue
import dev.bishnoi.forgelog.wear.sync.WorkoutBody
import dev.bishnoi.forgelog.wear.sync.WorkoutExerciseBody
import dev.bishnoi.forgelog.wear.sync.WorkoutReplica
import dev.bishnoi.forgelog.wear.sync.WorkoutReplicaState
import dev.bishnoi.forgelog.wear.sync.WorkoutWriter

fun compareEntryVersions(left: EntryVersion, right: EntryVersion): Int {
    val time = left.changedAtMs.compareTo(right.changedAtMs)
    // Writer names and all replica ids use Kotlin's UTF-16 code-unit order as the cross-platform contract.
    return if (time != 0) time else left.writer.wireName.compareTo(right.writer.wireName)
}

private fun <T> greaterVersioned(left: VersionedValue<T>, right: VersionedValue<T>): VersionedValue<T> =
    if (compareEntryVersions(left.version, right.version) >= 0) left else right

private fun joinSets(left: List<ActiveLoggedSet>, right: List<ActiveLoggedSet>): List<ActiveLoggedSet> =
    (left + right).groupBy { it.id }.map { (_, entries) ->
        entries.maxWith { a, b -> compareEntryVersions(a.version, b.version) }
    }.sortedBy { it.id }

private fun joinExercises(
    left: List<ActiveWorkoutExercise>,
    right: List<ActiveWorkoutExercise>,
): List<ActiveWorkoutExercise> {
    val leftById = left.associateBy { it.id }
    val rightById = right.associateBy { it.id }
    return (leftById.keys + rightById.keys).map { id ->
        val leftEntry = leftById[id]
        val rightEntry = rightById[id]
        when {
            leftEntry == null -> requireNotNull(rightEntry)
            rightEntry == null -> leftEntry
            else -> {
                val winner = if (compareEntryVersions(leftEntry.version, rightEntry.version) >= 0) {
                    leftEntry
                } else {
                    rightEntry
                }
                winner.copy(sets = joinSets(leftEntry.sets, rightEntry.sets))
            }
        }
    }.sortedBy { it.id }
}

fun joinActiveWorkoutBodies(left: ActiveWorkoutBody, right: ActiveWorkoutBody): ActiveWorkoutBody =
    ActiveWorkoutBody(
        fields = left.fields.copy(
            routineId = greaterVersioned(left.fields.routineId, right.fields.routineId),
            routineStructureVersion = greaterVersioned(
                left.fields.routineStructureVersion,
                right.fields.routineStructureVersion,
            ),
            name = greaterVersioned(left.fields.name, right.fields.name),
            notes = greaterVersioned(left.fields.notes, right.fields.notes),
            bodyweightKg = greaterVersioned(left.fields.bodyweightKg, right.fields.bodyweightKg),
        ),
        exercises = joinExercises(left.exercises, right.exercises),
    )

fun activeBodyDominates(left: ActiveWorkoutBody, right: ActiveWorkoutBody): Boolean =
    joinActiveWorkoutBodies(left, right) == left

fun materializeActiveWorkout(body: ActiveWorkoutBody): WorkoutBody = WorkoutBody(
    routineId = body.fields.routineId.value,
    routineStructureVersion = body.fields.routineStructureVersion.value,
    name = body.fields.name.value,
    notes = body.fields.notes.value,
    bodyweightKg = body.fields.bodyweightKg.value,
    exercises = body.exercises
        .filter { !it.deleted && it.position != null && it.value != null }
        .sortedWith(compareBy({ it.position }, { it.id }))
        .map { exercise ->
            val value = requireNotNull(exercise.value)
            WorkoutExerciseBody(
                id = exercise.id,
                exerciseId = value.exerciseId,
                exerciseName = value.exerciseName,
                sourceRoutineExerciseId = value.sourceRoutineExerciseId,
                supersetGroupId = value.supersetGroupId,
                exerciseType = value.exerciseType,
                notes = value.notes,
                sets = exercise.sets
                    .filter { !it.deleted && it.position != null && it.value != null }
                    .sortedWith(compareBy({ it.position }, { it.id }))
                    .map { set ->
                        val setValue = requireNotNull(set.value)
                        LoggedSetBody(
                            id = set.id,
                            sourceRoutineSetId = setValue.sourceRoutineSetId,
                            setType = setValue.setType,
                            weight = setValue.weight,
                            reps = setValue.reps,
                            durationSeconds = setValue.durationSeconds,
                            distanceMeters = setValue.distanceMeters,
                            rpe = setValue.rpe,
                            completed = setValue.completed,
                            completedAtMs = setValue.completedAtMs,
                        )
                    },
            )
        },
)

private fun lifecycleRank(state: WorkoutReplicaState): Int = when (state) {
    is WorkoutReplicaState.Active -> 0
    WorkoutReplicaState.Discarded -> 1
    is WorkoutReplicaState.Finished -> 2
}

private fun compareEnvelopes(left: AuthoredWorkoutReplica, right: AuthoredWorkoutReplica): Int {
    val changedAt = left.replica.changedAtMs.compareTo(right.replica.changedAtMs)
    return if (changedAt != 0) changedAt else left.writer.wireName.compareTo(right.writer.wireName)
}

fun resolveSameWorkout(
    stored: AuthoredWorkoutReplica,
    incoming: AuthoredWorkoutReplica,
    localWriter: WorkoutWriter,
    joinedChangedAtMs: Long,
): AuthoredWorkoutReplica {
    require(stored.replica.workoutId == incoming.replica.workoutId) { "Workout ids differ" }
    require(stored.replica.startedAtMs == incoming.replica.startedAtMs) { "Workout starts differ" }
    val storedRank = lifecycleRank(stored.replica.state)
    val incomingRank = lifecycleRank(incoming.replica.state)
    if (storedRank != incomingRank) return if (storedRank > incomingRank) stored else incoming
    val storedActive = stored.replica.state as? WorkoutReplicaState.Active
    val incomingActive = incoming.replica.state as? WorkoutReplicaState.Active
    if (storedActive == null || incomingActive == null) {
        return if (compareEnvelopes(stored, incoming) >= 0) stored else incoming
    }
    val joined = joinActiveWorkoutBodies(storedActive.workout, incomingActive.workout)
    val equalsStored = joined == storedActive.workout
    val equalsIncoming = joined == incomingActive.workout
    if (equalsStored && equalsIncoming) {
        return if (compareEnvelopes(stored, incoming) >= 0) stored else incoming
    }
    if (equalsStored) return stored
    if (equalsIncoming) return incoming
    return AuthoredWorkoutReplica(
        localWriter,
        WorkoutReplica(
            workoutId = stored.replica.workoutId,
            startedAtMs = stored.replica.startedAtMs,
            changedAtMs = maxOf(
                joinedChangedAtMs,
                stored.replica.changedAtMs + 1,
                incoming.replica.changedAtMs + 1,
            ),
            state = WorkoutReplicaState.Active(joined),
        ),
    )
}

fun selectCurrentGeneration(replicas: List<AuthoredWorkoutReplica>): AuthoredWorkoutReplica? =
    replicas.maxWithOrNull(compareBy({ it.replica.startedAtMs }, { it.replica.workoutId }))

fun selectOutboundCandidate(
    writer: WorkoutWriter,
    pendingFinished: List<WorkoutReplica>,
    transportIntent: WorkoutReplica?,
): WorkoutReplica? = if (writer == WorkoutWriter.WATCH && pendingFinished.isNotEmpty()) {
    pendingFinished.first()
} else {
    transportIntent
}
