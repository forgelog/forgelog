package dev.bishnoi.forgelog.wear.ui

/**
 * Central navigation graph for the watch app. Route templates and the
 * functions that fill in their arguments live together so the NavHost and its
 * callers can't drift out of sync, and so route construction stays unit-testable.
 */
object WearRoutes {
    const val ARG_ROUTINE_ID = "routineId"
    const val ARG_WORKOUT_ID = "workoutId"
    const val ARG_WORKOUT_EXERCISE_ID = "workoutExerciseId"

    const val ROUTINES = "routines"
    const val ROUTINE_DETAIL = "routine/{$ARG_ROUTINE_ID}"
    const val WORKOUT = "workout/{$ARG_WORKOUT_ID}"
    const val EXERCISE = "exercise/{$ARG_WORKOUT_EXERCISE_ID}"

    fun routineDetail(routineId: String) = "routine/$routineId"
    fun workout(workoutId: String) = "workout/$workoutId"
    fun exercise(workoutExerciseId: String) = "exercise/$workoutExerciseId"
}
