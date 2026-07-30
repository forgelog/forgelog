package dev.bishnoi.forgelog.wear.sync

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

private val WORKOUT_MAILBOX_KEYS = setOf("protocol_version", "candidate", "watch_receipt")
private val strictWorkoutMailboxJson = Json {
    ignoreUnknownKeys = false
    encodeDefaults = true
    classDiscriminator = "kind"
}

fun decodeWorkoutMailboxPayload(payload: String): WorkoutMailbox? {
    val outer = runCatching { syncJson.parseToJsonElement(payload) as? JsonObject }.getOrNull()
        ?: return null
    if (outer.keys != WORKOUT_MAILBOX_KEYS) return null
    val protocolVersion = runCatching {
        outer["protocol_version"]?.jsonPrimitive?.intOrNull
    }.getOrNull()
    if (protocolVersion != WORKOUT_MAILBOX_PROTOCOL_VERSION) {
        return null
    }

    val candidateElement = outer.getValue("candidate")
    val receiptElement = outer.getValue("watch_receipt")
    val candidate = if (candidateElement is JsonNull || !candidateElement.hasWorkoutReplicaShape()) {
        null
    } else {
        runCatching {
            strictWorkoutMailboxJson.decodeFromJsonElement(WorkoutReplica.serializer(), candidateElement)
        }.getOrNull()
    }
    val receipt = if (receiptElement is JsonNull || !receiptElement.hasExactKeys(RECEIPT_KEYS)) {
        null
    } else {
        runCatching {
            strictWorkoutMailboxJson.decodeFromJsonElement(WorkoutReceipt.serializer(), receiptElement)
        }.getOrNull()
    }
    return WorkoutMailbox(candidate = candidate, watchReceipt = receipt)
}

private val RECEIPT_KEYS = setOf("workout_id", "watch_started_at_ms", "watch_changed_at_ms")
private val REPLICA_KEYS = setOf("workout_id", "started_at_ms", "changed_at_ms", "state")
private val ACTIVE_STATE_KEYS = setOf("kind", "workout")
private val FINISHED_STATE_KEYS = setOf("kind", "ended_at_ms", "workout")
private val ACTIVE_BODY_KEYS = setOf("fields", "exercises")
private val ACTIVE_FIELDS_KEYS = setOf(
    "routine_id",
    "routine_structure_version",
    "name",
    "notes",
    "bodyweight_kg",
)
private val VERSIONED_VALUE_KEYS = setOf("version", "value")
private val ENTRY_VERSION_KEYS = setOf("changed_at_ms", "writer")
private val ACTIVE_EXERCISE_KEYS = setOf("id", "version", "deleted", "position", "value", "sets")
private val EXERCISE_VALUE_KEYS = setOf(
    "exercise_id",
    "exercise_name",
    "source_routine_exercise_id",
    "superset_group_id",
    "exercise_type",
    "notes",
)
private val ACTIVE_SET_KEYS = setOf("id", "version", "deleted", "position", "value")
private val SET_VALUE_KEYS = setOf(
    "source_routine_set_id",
    "set_type",
    "weight",
    "reps",
    "duration_seconds",
    "distance_meters",
    "rpe",
    "completed",
    "completed_at_ms",
)
private val FINISHED_BODY_KEYS = setOf(
    "routine_id",
    "routine_structure_version",
    "name",
    "notes",
    "bodyweight_kg",
    "exercises",
)
private val FINISHED_EXERCISE_KEYS = EXERCISE_VALUE_KEYS + setOf("id", "sets")
private val FINISHED_SET_KEYS = SET_VALUE_KEYS + "id"
private val VALID_EXERCISE_TYPES = setOf(
    "weight_reps",
    "reps_only",
    "weighted_bodyweight",
    "assisted_bodyweight",
    "duration",
    "duration_weight",
    "distance_duration",
    "weight_distance",
)
private val VALID_SET_TYPES = setOf("normal", "warmup", "dropset", "failure")

private fun JsonElement.hasWorkoutReplicaShape(): Boolean {
    if (!hasExactKeys(REPLICA_KEYS)) return false
    val state = (this as JsonObject).getValue("state") as? JsonObject ?: return false
    val kind = runCatching { state["kind"]?.jsonPrimitive?.content }.getOrNull()
    return when (kind) {
        "active" -> state.hasExactKeys(ACTIVE_STATE_KEYS) &&
            state.getValue("workout").hasActiveBodyShape()
        "finished" -> state.hasExactKeys(FINISHED_STATE_KEYS) &&
            state.getValue("workout").hasFinishedBodyShape()
        "discarded" -> state.hasExactKeys(setOf("kind"))
        else -> false
    }
}

private fun JsonElement.hasActiveBodyShape(): Boolean {
    if (!hasExactKeys(ACTIVE_BODY_KEYS)) return false
    val body = this as JsonObject
    val fields = body["fields"] as? JsonObject ?: return false
    if (!fields.hasExactKeys(ACTIVE_FIELDS_KEYS)) return false
    if (fields.values.any { !it.hasVersionedValueShape() }) return false
    val exercises = body["exercises"] as? JsonArray ?: return false
    return exercises.all { it.hasActiveExerciseShape() }
}

private fun JsonElement.hasVersionedValueShape(): Boolean {
    if (!hasExactKeys(VERSIONED_VALUE_KEYS)) return false
    return (this as JsonObject).getValue("version").hasExactKeys(ENTRY_VERSION_KEYS)
}

private fun JsonElement.hasActiveExerciseShape(): Boolean {
    if (!hasExactKeys(ACTIVE_EXERCISE_KEYS)) return false
    val exercise = this as JsonObject
    if (!exercise.getValue("version").hasExactKeys(ENTRY_VERSION_KEYS)) return false
    val value = exercise.getValue("value")
    if (value !is JsonNull && !value.hasExactKeys(EXERCISE_VALUE_KEYS)) return false
    val sets = exercise["sets"] as? JsonArray ?: return false
    return sets.all { it.hasActiveSetShape() }
}

private fun JsonElement.hasActiveSetShape(): Boolean {
    if (!hasExactKeys(ACTIVE_SET_KEYS)) return false
    val set = this as JsonObject
    if (!set.getValue("version").hasExactKeys(ENTRY_VERSION_KEYS)) return false
    val value = set.getValue("value")
    return value is JsonNull || value.hasExactKeys(SET_VALUE_KEYS)
}

private fun JsonElement.hasFinishedBodyShape(): Boolean {
    if (!hasExactKeys(FINISHED_BODY_KEYS)) return false
    val exercises = (this as JsonObject)["exercises"] as? JsonArray ?: return false
    return exercises.all { exerciseElement ->
        if (!exerciseElement.hasExactKeys(FINISHED_EXERCISE_KEYS)) return@all false
        val sets = (exerciseElement as JsonObject)["sets"] as? JsonArray ?: return@all false
        sets.all { it.hasExactKeys(FINISHED_SET_KEYS) }
    }
}

private fun JsonElement.hasExactKeys(expected: Set<String>): Boolean =
    this is JsonObject && keys == expected

fun validateWorkoutMailbox(
    pathWriter: WorkoutWriter,
    mailbox: WorkoutMailbox,
    knownState: List<AuthoredWorkoutReplica>,
): ValidatedWorkoutMailbox? {
    if (mailbox.protocolVersion != WORKOUT_MAILBOX_PROTOCOL_VERSION) return null
    if (pathWriter == WorkoutWriter.WATCH && mailbox.watchReceipt != null) return null
    val candidate = mailbox.candidate?.takeIf {
        validateWorkoutReplica(pathWriter, it, knownState)
    }
    val receipt = mailbox.watchReceipt?.takeIf {
        it.watchStartedAtMs >= 0 && it.watchChangedAtMs >= 0
    }
    return ValidatedWorkoutMailbox(candidate, receipt)
}

data class ValidatedWorkoutMailbox(
    val candidate: WorkoutReplica?,
    val watchReceipt: WorkoutReceipt?,
)

fun validateWorkoutReplica(
    pathWriter: WorkoutWriter,
    replica: WorkoutReplica,
    knownState: List<AuthoredWorkoutReplica>,
): Boolean {
    if (replica.startedAtMs < 0 || replica.changedAtMs < 0) return false
    if (!hasValidReplicaState(replica)) return false
    return knownState.all { isCompatibleWithKnownReplica(pathWriter, replica, it) }
}

private fun hasValidReplicaState(replica: WorkoutReplica): Boolean = when (val state = replica.state) {
    is WorkoutReplicaState.Active -> validateActive(state.workout, replica.changedAtMs)
    is WorkoutReplicaState.Finished -> validateFinished(state, replica.startedAtMs)
    WorkoutReplicaState.Discarded -> true
}

private fun validateFinished(state: WorkoutReplicaState.Finished, startedAtMs: Long): Boolean =
    state.endedAtMs >= startedAtMs && state.workout.exercises.all { exercise ->
        exercise.exerciseType in VALID_EXERCISE_TYPES && exercise.sets.all { set ->
            set.setType in VALID_SET_TYPES &&
                hasValidCompletion(set.completed, set.completedAtMs)
        }
    }

private fun isCompatibleWithKnownReplica(
    pathWriter: WorkoutWriter,
    replica: WorkoutReplica,
    known: AuthoredWorkoutReplica,
): Boolean {
    if (known.replica.workoutId != replica.workoutId) return true
    if (known.replica.startedAtMs != replica.startedAtMs) return false
    if (
        known.writer == pathWriter &&
        known.replica.changedAtMs == replica.changedAtMs &&
        known.replica != replica
    ) return false
    val incomingActive = replica.state as? WorkoutReplicaState.Active ?: return true
    val knownActive = known.replica.state as? WorkoutReplicaState.Active ?: return true
    return versionsKeepCanonicalContent(incomingActive.workout, knownActive.workout)
}

private fun validateActive(body: ActiveWorkoutBody, envelopeChangedAtMs: Long): Boolean {
    val fieldVersions = listOf(
        body.fields.routineId.version,
        body.fields.routineStructureVersion.version,
        body.fields.name.version,
        body.fields.notes.version,
        body.fields.bodyweightKg.version,
    )
    if (!fieldVersions.all { it.isWithinEnvelope(envelopeChangedAtMs) }) return false
    if (!body.exercises.isCanonicalById()) return false
    val setIds = mutableSetOf<String>()
    return body.exercises.all { validateActiveExercise(it, envelopeChangedAtMs, setIds) }
}

private fun EntryVersion.isWithinEnvelope(envelopeChangedAtMs: Long): Boolean =
    changedAtMs in 0..envelopeChangedAtMs

private fun validateActiveExercise(
    exercise: ActiveWorkoutExercise,
    envelopeChangedAtMs: Long,
    setIds: MutableSet<String>,
): Boolean {
    if (!exercise.version.isWithinEnvelope(envelopeChangedAtMs)) return false
    if (!exercise.hasValidLiveOrDeletedShape()) return false
    if (!exercise.sets.isCanonicalById()) return false
    return exercise.sets.all { validateActiveSet(it, envelopeChangedAtMs, setIds) }
}

private fun ActiveWorkoutExercise.hasValidLiveOrDeletedShape(): Boolean {
    if (deleted) return position == null && value == null
    return position != null && position >= 0 && value?.exerciseType in VALID_EXERCISE_TYPES
}

private fun validateActiveSet(
    set: ActiveLoggedSet,
    envelopeChangedAtMs: Long,
    setIds: MutableSet<String>,
): Boolean {
    if (!setIds.add(set.id)) return false
    if (!set.version.isWithinEnvelope(envelopeChangedAtMs)) return false
    if (!set.hasValidLiveOrDeletedShape()) return false
    return set.value?.let { hasValidCompletion(it.completed, it.completedAtMs) } != false
}

private fun ActiveLoggedSet.hasValidLiveOrDeletedShape(): Boolean {
    if (deleted) return position == null && value == null
    return position != null && position >= 0 && value?.setType in VALID_SET_TYPES
}

private fun hasValidCompletion(completed: Boolean, completedAtMs: Long?): Boolean {
    if (completedAtMs != null && completedAtMs < 0) return false
    return completed || completedAtMs == null
}

private fun <T : Any> List<T>.isCanonicalById(): Boolean {
    val ids = map {
        when (it) {
            is ActiveWorkoutExercise -> it.id
            is ActiveLoggedSet -> it.id
            else -> error("Unsupported canonical entry")
        }
    }
    return ids == ids.sorted() && ids.distinct().size == ids.size
}

private fun versionsKeepCanonicalContent(
    incoming: ActiveWorkoutBody,
    known: ActiveWorkoutBody,
): Boolean {
    val incomingFields = listOf(
        incoming.fields.routineId,
        incoming.fields.routineStructureVersion,
        incoming.fields.name,
        incoming.fields.notes,
        incoming.fields.bodyweightKg,
    )
    val knownFields = listOf(
        known.fields.routineId,
        known.fields.routineStructureVersion,
        known.fields.name,
        known.fields.notes,
        known.fields.bodyweightKg,
    )
    if (incomingFields.zip(knownFields).any { (left, right) ->
            left.version == right.version && left != right
        }
    ) return false

    val knownExercises = known.exercises.associateBy { it.id }
    val knownParents = known.exercises.flatMap { exercise ->
        exercise.sets.map { it.id to exercise.id }
    }.toMap()
    for (exercise in incoming.exercises) {
        val knownExercise = knownExercises[exercise.id]
        if (
            knownExercise != null &&
            exercise.version == knownExercise.version &&
            exercise.copy(sets = emptyList()) != knownExercise.copy(sets = emptyList())
        ) return false
        val knownSets = knownExercise?.sets.orEmpty().associateBy { it.id }
        for (set in exercise.sets) {
            if (knownParents[set.id]?.let { it != exercise.id } == true) return false
            val knownSet = knownSets[set.id]
            if (knownSet != null && set.version == knownSet.version && set != knownSet) return false
        }
    }
    return true
}

fun receiptMatchesPendingFinish(receipt: WorkoutReceipt, pending: WorkoutReplica): Boolean =
    pending.state is WorkoutReplicaState.Finished &&
        receipt.workoutId == pending.workoutId &&
        receipt.watchStartedAtMs == pending.startedAtMs &&
        receipt.watchChangedAtMs == pending.changedAtMs
