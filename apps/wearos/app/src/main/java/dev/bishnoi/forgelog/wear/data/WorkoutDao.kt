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
    // todo: audit pending
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: WorkoutEntity)

    // todo: audit pending
    @Update
    suspend fun updateWorkout(workout: WorkoutEntity)

    // todo: audit pending
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkoutExercise(workoutExercise: WorkoutExerciseEntity)

    // todo: audit pending
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLoggedSet(loggedSet: LoggedSetEntity)

    @Transaction
    suspend fun insertWorkoutSession(
        workout: WorkoutEntity,
        workoutExercises: List<WorkoutExerciseEntity>,
        loggedSets: List<LoggedSetEntity>,
    ) {
        insertWorkout(workout)
        workoutExercises.forEach { insertWorkoutExercise(it) }
        loggedSets.forEach { insertLoggedSet(it) }
    }

    // todo: audit pending
    @Update
    suspend fun updateLoggedSet(loggedSet: LoggedSetEntity)

    // todo: audit pending
    @Query("UPDATE logged_sets SET completed = :completed, completedAt = :completedAt WHERE id = :loggedSetId")
    suspend fun updateLoggedSetCompletion(loggedSetId: String, completed: Boolean, completedAt: String?)

    // todo: audit pending
    @Query("DELETE FROM logged_sets WHERE id = :loggedSetId")
    suspend fun deleteLoggedSet(loggedSetId: String)

    // todo: audit pending
    @Query("SELECT COALESCE(MAX(position) + 1, 0) FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun nextSetPosition(workoutExerciseId: String): Int

    // todo: audit pending
    @Query("SELECT * FROM workouts WHERE id = :workoutId")
    suspend fun getWorkout(workoutId: String): WorkoutEntity?

    // todo: audit pending
    @Query("SELECT * FROM workouts WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1")
    fun observeActiveWorkout(): Flow<WorkoutEntity?>

    // todo: audit pending
    @Query("SELECT * FROM workout_exercises WHERE workoutId = :workoutId ORDER BY position")
    fun observeWorkoutExercises(workoutId: String): Flow<List<WorkoutExerciseEntity>>

    // todo: audit pending
    @Query("SELECT * FROM workout_exercises WHERE id = :workoutExerciseId")
    suspend fun getWorkoutExercise(workoutExerciseId: String): WorkoutExerciseEntity?

    // todo: audit pending
    @Query("SELECT * FROM workout_exercises WHERE id = :workoutExerciseId")
    fun observeWorkoutExerciseById(workoutExerciseId: String): Flow<WorkoutExerciseEntity?>

    // todo: audit pending
    @Query("SELECT * FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId ORDER BY position")
    fun observeLoggedSets(workoutExerciseId: String): Flow<List<LoggedSetEntity>>

    // todo: audit pending
    @Query(
        "SELECT * FROM logged_sets WHERE workoutExerciseId IN " +
            "(SELECT id FROM workout_exercises WHERE workoutId = :workoutId) ORDER BY position",
    )
    fun observeLoggedSetsForWorkout(workoutId: String): Flow<List<LoggedSetEntity>>

    // todo: audit pending
    @Query("DELETE FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId")
    suspend fun deleteLoggedSetsForExercise(workoutExerciseId: String)

    // todo: audit pending
    @Query("DELETE FROM workout_exercises WHERE id = :workoutExerciseId")
    suspend fun deleteWorkoutExercise(workoutExerciseId: String)

    // todo: audit pending
    @Query(
        "DELETE FROM logged_sets WHERE workoutExerciseId IN " +
            "(SELECT id FROM workout_exercises WHERE workoutId = :workoutId)",
    )
    suspend fun deleteLoggedSetsForWorkout(workoutId: String)

    // todo: audit pending
    @Query("DELETE FROM workout_exercises WHERE workoutId = :workoutId")
    suspend fun deleteWorkoutExercisesForWorkout(workoutId: String)

    // todo: audit pending
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

    // todo: audit pending
    @Query("SELECT * FROM logged_sets WHERE workoutExerciseId = :workoutExerciseId ORDER BY position")
    suspend fun loggedSets(workoutExerciseId: String): List<LoggedSetEntity>

    // todo: audit pending
    @Query("SELECT * FROM logged_sets WHERE id = :loggedSetId")
    suspend fun loggedSet(loggedSetId: String): LoggedSetEntity?

    // todo: audit pending
    @Query("SELECT * FROM workout_exercises WHERE workoutId = :workoutId ORDER BY position")
    suspend fun workoutExercises(workoutId: String): List<WorkoutExerciseEntity>

    // The write-ahead log: workouts not yet confirmed ingested by the phone.
    // todo: audit pending
    @Query("SELECT * FROM workouts WHERE synced = 0")
    suspend fun unsyncedWorkouts(): List<WorkoutEntity>

    // todo: audit pending
    @Query("UPDATE workouts SET synced = 1 WHERE id = :workoutId")
    suspend fun markSynced(workoutId: String)
}
