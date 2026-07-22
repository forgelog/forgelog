package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.DataStore
import dev.bishnoi.forgelog.wear.logic.ExerciseType
import dev.bishnoi.forgelog.wear.logic.RecordType
import dev.bishnoi.forgelog.wear.logic.SET_TYPES
import dev.bishnoi.forgelog.wear.sync.PersonalRecordDto
import dev.bishnoi.forgelog.wear.sync.RoutineDetailDto
import dev.bishnoi.forgelog.wear.sync.SYNC_PROTOCOL_VERSION
import dev.bishnoi.forgelog.wear.sync.SyncSnapshot
import dev.bishnoi.forgelog.wear.sync.UserProfileDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class ReferenceRepository(
    private val store: DataStore<ReferenceState>,
    private val nowEpochMillis: () -> Long = System::currentTimeMillis,
) {
    val state: Flow<ReferenceState> = store.data
    val routines: Flow<List<RoutineDetailDto>> = state.map { reference ->
        reference.snapshot?.routines.orEmpty().sortedBy { it.position }
    }

    suspend fun replaceSnapshot(snapshot: SyncSnapshot) {
        snapshot.validateForStorage()
        store.updateData {
            ReferenceState(snapshot = snapshot, receivedAtEpochMillis = nowEpochMillis())
        }
    }

    suspend fun clearRecoverableCache() {
        store.updateData { ReferenceState() }
    }

    suspend fun currentRoutine(id: String): RoutineDetailDto? =
        state.first().snapshot?.routines?.firstOrNull { it.id == id }

    suspend fun currentProfile(): UserProfileDto? = state.first().snapshot?.profile

    suspend fun recordsForExercise(exerciseId: String): List<PersonalRecordDto> =
        state.first().snapshot?.personalRecords.orEmpty().filter { it.exerciseId == exerciseId }

    internal suspend fun workoutReference(routineId: String): WorkoutReference? {
        val snapshot = state.first().snapshot ?: return null
        val routine = snapshot.routines.firstOrNull { it.id == routineId } ?: return null
        val recordsByExercise = snapshot.personalRecords
            .groupBy { it.exerciseId }
            .mapValues { (_, records) -> records.associate { it.recordType to it.value } }
        return WorkoutReference(routine, recordsByExercise)
    }
}

internal data class WorkoutReference(
    val routine: RoutineDetailDto,
    val recordsByExercise: Map<String, Map<String, Double>>,
)

private fun SyncSnapshot.validateForStorage() {
    require(protocolVersion == SYNC_PROTOCOL_VERSION) {
        "Unsupported sync protocol $protocolVersion"
    }
    require(profile.sex == null || profile.sex in VALID_PROFILE_SEX_VALUES) {
        "Invalid profile sex: ${profile.sex}"
    }
    val exerciseIds = routines.flatMap { routine ->
        routine.exercises.map { routineExercise ->
            require(routineExercise.routineId == routine.id) {
                "Routine exercise ${routineExercise.id} belongs to ${routineExercise.routineId}, not ${routine.id}"
            }
            require(routineExercise.exercise.id == routineExercise.exerciseId) {
                "Exercise payload mismatch for ${routineExercise.id}"
            }
            require(ExerciseType.fromValue(routineExercise.exerciseType) != null) {
                "Invalid routine exercise type: ${routineExercise.exerciseType}"
            }
            require(ExerciseType.fromValue(routineExercise.exercise.exerciseType) != null) {
                "Invalid exercise type: ${routineExercise.exercise.exerciseType}"
            }
            routineExercise.sets.forEach { set ->
                require(set.routineExerciseId == routineExercise.id) {
                    "Routine set ${set.id} belongs to ${set.routineExerciseId}, not ${routineExercise.id}"
                }
                require(set.setType in SET_TYPES) { "Invalid set type: ${set.setType}" }
            }
            routineExercise.exerciseId
        }
    }.toSet()
    val recordTypes = RecordType.entries.mapTo(mutableSetOf()) { it.value }
    personalRecords.forEach { record ->
        require(record.exerciseId in exerciseIds) {
            "Personal record ${record.id} references an unsynced exercise"
        }
        require(record.recordType in recordTypes) { "Invalid record type: ${record.recordType}" }
    }
}

private val VALID_PROFILE_SEX_VALUES = setOf("male", "female", "prefer_not_to_say")
