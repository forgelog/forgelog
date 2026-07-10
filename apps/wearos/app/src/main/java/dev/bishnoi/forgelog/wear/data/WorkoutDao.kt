package dev.bishnoi.forgelog.wear.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkoutDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: WorkoutEntity)

    @Update
    suspend fun updateWorkout(workout: WorkoutEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkoutExercise(workoutExercise: WorkoutExerciseEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLoggedSet(loggedSet: LoggedSetEntity)

    @Update
    suspend fun updateLoggedSet(loggedSet: LoggedSetEntity)

    @Query("DELETE FROM logged_sets WHERE id = :loggedSetId")
    suspend fun deleteLoggedSet(loggedSetId: String)

    @Query("SELECT COALESCE(MAX(position) + 1, 0) FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun nextSetPosition(workoutExerciseId: String): Int

    @Query("SELECT * FROM workouts WHERE id = :workoutId")
    suspend fun getWorkout(workoutId: String): WorkoutEntity?

    @Query("SELECT * FROM workouts WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1")
    fun observeActiveWorkout(): Flow<WorkoutEntity?>

    @Query("SELECT * FROM workout_exercises WHERE workoutId = :workoutId ORDER BY position")
    fun observeWorkoutExercises(workoutId: String): Flow<List<WorkoutExerciseEntity>>

    @Query("SELECT * FROM workout_exercises WHERE id = :workoutExerciseId")
    suspend fun getWorkoutExercise(workoutExerciseId: String): WorkoutExerciseEntity?

    @Query("SELECT * FROM workout_exercises WHERE id = :workoutExerciseId")
    fun observeWorkoutExerciseById(workoutExerciseId: String): Flow<WorkoutExerciseEntity?>

    @Query("SELECT * FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId ORDER BY position")
    fun observeLoggedSets(workoutExerciseId: String): Flow<List<LoggedSetEntity>>

    @Query(
        "SELECT * FROM logged_sets WHERE workoutExerciseId IN " +
            "(SELECT id FROM workout_exercises WHERE workoutId = :workoutId) ORDER BY position",
    )
    fun observeLoggedSetsForWorkout(workoutId: String): Flow<List<LoggedSetEntity>>

    @Query("DELETE FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun deleteLoggedSetsForExercise(workoutExerciseId: String)

    @Query("DELETE FROM workout_exercises WHERE id = :workoutExerciseId")
    suspend fun deleteWorkoutExercise(workoutExerciseId: String)

    @Query(
        "DELETE FROM logged_sets WHERE workoutExerciseId IN " +
            "(SELECT id FROM workout_exercises WHERE workoutId = :workoutId)",
    )
    suspend fun deleteLoggedSetsForWorkout(workoutId: String)

    @Query("DELETE FROM workout_exercises WHERE workoutId = :workoutId")
    suspend fun deleteWorkoutExercisesForWorkout(workoutId: String)

    @Query("DELETE FROM workouts WHERE id = :workoutId")
    suspend fun deleteWorkout(workoutId: String)

    /** No FK cascade is declared on these entities, so children are removed explicitly. */
    @Transaction
    suspend fun deleteWorkoutCascade(workoutId: String) {
        deleteLoggedSetsForWorkout(workoutId)
        deleteWorkoutExercisesForWorkout(workoutId)
        deleteWorkout(workoutId)
    }

    @Transaction
    suspend fun deleteExerciseCascade(workoutExerciseId: String) {
        deleteLoggedSetsForExercise(workoutExerciseId)
        deleteWorkoutExercise(workoutExerciseId)
    }

    @Query("SELECT * FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId ORDER BY position")
    suspend fun loggedSets(workoutExerciseId: String): List<LoggedSetEntity>

    @Query("SELECT * FROM workout_exercises WHERE workoutId = :workoutId ORDER BY position")
    suspend fun workoutExercises(workoutId: String): List<WorkoutExerciseEntity>

    // The write-ahead log: workouts not yet confirmed ingested by the phone.
    @Query("SELECT * FROM workouts WHERE synced = 0")
    suspend fun unsyncedWorkouts(): List<WorkoutEntity>

    @Query("UPDATE workouts SET synced = 1 WHERE id = :workoutId")
    suspend fun markSynced(workoutId: String)
}
