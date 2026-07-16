package dev.bishnoi.forgelog.wear.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        ExerciseEntity::class,
        RoutineEntity::class,
        RoutineExerciseEntity::class,
        RoutineSetEntity::class,
        PersonalRecordEntity::class,
        WorkoutEntity::class,
        WorkoutExerciseEntity::class,
        LoggedSetEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun referenceDao(): ReferenceDao
    abstract fun workoutDao(): WorkoutDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "forgelog-wear.db",
                ).addMigrations(MIGRATION_1_2).build().also { instance = it }
            }
    }
}

private val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // todo: audit pending
        db.execSQL(
            """
            CREATE TABLE routine_exercises_next (
                id TEXT NOT NULL PRIMARY KEY,
                routineId TEXT NOT NULL,
                exerciseId TEXT NOT NULL,
                position INTEGER NOT NULL,
                supersetGroupId TEXT,
                exerciseType TEXT NOT NULL
            )
            """.trimIndent()
        )
        // todo: audit pending
        db.execSQL(
            """
            INSERT INTO routine_exercises_next
                (id, routineId, exerciseId, position, supersetGroupId, exerciseType)
            SELECT id, routineId, exerciseId, position, supersetGroupId, exerciseType
            FROM routine_exercises
            """.trimIndent()
        )
        // todo: audit pending
        db.execSQL("DROP TABLE routine_exercises")
        // todo: audit pending
        db.execSQL("ALTER TABLE routine_exercises_next RENAME TO routine_exercises")

        // todo: audit pending
        db.execSQL(
            """
            CREATE TABLE workout_exercises_next (
                id TEXT NOT NULL PRIMARY KEY,
                workoutId TEXT NOT NULL,
                exerciseId TEXT NOT NULL,
                position INTEGER NOT NULL,
                supersetGroupId TEXT,
                exerciseType TEXT NOT NULL
            )
            """.trimIndent()
        )
        // todo: audit pending
        db.execSQL(
            """
            INSERT INTO workout_exercises_next
                (id, workoutId, exerciseId, position, supersetGroupId, exerciseType)
            SELECT id, workoutId, exerciseId, position, supersetGroupId, exerciseType
            FROM workout_exercises
            """.trimIndent()
        )
        // todo: audit pending
        db.execSQL("DROP TABLE workout_exercises")
        // todo: audit pending
        db.execSQL("ALTER TABLE workout_exercises_next RENAME TO workout_exercises")
    }
}
