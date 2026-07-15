package dev.bishnoi.forgelog.wear.data

import androidx.room.Entity
import androidx.room.PrimaryKey

// Reference tables: populated from the phone's SyncSnapshot
// (apps/mobile/src/db/repositories/sync.ts getSyncSnapshot), read-only on
// the watch.

@Entity(tableName = "exercises")
data class ExerciseEntity(
    @PrimaryKey val id: String,
    val name: String,
    val exerciseType: String,
)

@Entity(tableName = "routines")
data class RoutineEntity(
    @PrimaryKey val id: String,
    val name: String,
    val position: Int,
)

@Entity(tableName = "routine_exercises")
data class RoutineExerciseEntity(
    @PrimaryKey val id: String,
    val routineId: String,
    val exerciseId: String,
    val position: Int,
    val supersetGroupId: String?,
    val exerciseType: String,
)

@Entity(tableName = "routine_sets")
data class RoutineSetEntity(
    @PrimaryKey val id: String,
    val routineExerciseId: String,
    val position: Int,
    val setType: String,
    val targetWeight: Double?,
    val targetReps: Int?,
    val targetDurationSeconds: Int?,
    val targetDistanceMeters: Double?,
)

@Entity(tableName = "personal_records")
data class PersonalRecordEntity(
    @PrimaryKey val id: String,
    val exerciseId: String,
    val recordType: String,
    val value: Double,
    val achievedAt: String,
)

// Session tables: the write-ahead log. `synced = false` marks rows the watch
// hasn't confirmed the phone has ingested yet (see sync.WorkoutSyncPayload).

@Entity(tableName = "workouts")
data class WorkoutEntity(
    @PrimaryKey val id: String,
    val routineId: String?,
    val name: String,
    val startedAt: String,
    val endedAt: String?,
    val synced: Boolean = false,
)

@Entity(tableName = "workout_exercises")
data class WorkoutExerciseEntity(
    @PrimaryKey val id: String,
    val workoutId: String,
    val exerciseId: String,
    val position: Int,
    val supersetGroupId: String?,
    val exerciseType: String,
)

@Entity(tableName = "logged_sets")
data class LoggedSetEntity(
    @PrimaryKey val id: String,
    val workoutExerciseId: String,
    val position: Int,
    val setType: String,
    val weight: Double?,
    val reps: Int?,
    val durationSeconds: Int?,
    val distanceMeters: Double?,
    val rpe: Double?,
    val completed: Boolean = false,
    val completedAt: String?,
)
