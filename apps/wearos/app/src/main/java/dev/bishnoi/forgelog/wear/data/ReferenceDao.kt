package dev.bishnoi.forgelog.wear.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ReferenceDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertExercises(exercises: List<ExerciseEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRoutines(routines: List<RoutineEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRoutineExercises(routineExercises: List<RoutineExerciseEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRoutineSets(routineSets: List<RoutineSetEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPersonalRecords(records: List<PersonalRecordEntity>)

    @Query("SELECT * FROM routines ORDER BY position")
    fun observeRoutines(): Flow<List<RoutineEntity>>

    @Query("SELECT * FROM routines ORDER BY position")
    suspend fun getRoutines(): List<RoutineEntity>

    @Query("SELECT * FROM routines WHERE id = :routineId")
    suspend fun routine(routineId: String): RoutineEntity?

    @Query("SELECT * FROM routine_exercises WHERE routineId = :routineId ORDER BY position")
    suspend fun routineExercises(routineId: String): List<RoutineExerciseEntity>

    @Query("SELECT * FROM routine_sets WHERE routineExerciseId = :routineExerciseId ORDER BY position")
    suspend fun routineSets(routineExerciseId: String): List<RoutineSetEntity>

    @Query("SELECT * FROM exercises WHERE id = :exerciseId")
    suspend fun exercise(exerciseId: String): ExerciseEntity?

    @Query("SELECT * FROM personal_records WHERE exerciseId = :exerciseId")
    suspend fun recordsForExercise(exerciseId: String): List<PersonalRecordEntity>
}
