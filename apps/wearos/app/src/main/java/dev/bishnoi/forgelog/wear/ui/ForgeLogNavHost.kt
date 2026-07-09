package dev.bishnoi.forgelog.wear.ui

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController

private const val ROUTE_ROUTINES = "routines"
private const val ROUTE_EXERCISES = "exercises/{workoutId}"
private const val ROUTE_EXERCISE = "exercise/{workoutExerciseId}"
private const val ARG_WORKOUT_ID = "workoutId"
private const val ARG_WORKOUT_EXERCISE_ID = "workoutExerciseId"

/** The 3 swipeable screens per docs/wearos-scope.md. */
@Composable
fun ForgeLogNavHost() {
    val navController = rememberSwipeDismissableNavController()
    val application = LocalContext.current.applicationContext as Application

    SwipeDismissableNavHost(navController = navController, startDestination = ROUTE_ROUTINES) {
        composable(ROUTE_ROUTINES) {
            val viewModel: RoutineListViewModel = viewModel(
                factory = SimpleViewModelFactory { RoutineListViewModel(application) },
            )
            val routines by viewModel.routines.collectAsState()
            RoutineListScreen(
                routines = routines,
                onStart = { routineId ->
                    viewModel.startWorkout(routineId) { workoutId ->
                        navController.navigate(ROUTE_EXERCISES.replace("{$ARG_WORKOUT_ID}", workoutId))
                    }
                },
            )
        }

        composable(
            route = ROUTE_EXERCISES,
            arguments = listOf(navArgument(ARG_WORKOUT_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val workoutId = backStackEntry.arguments?.getString(ARG_WORKOUT_ID).orEmpty()
            val viewModel: ExerciseListViewModel = viewModel(
                factory = SimpleViewModelFactory { ExerciseListViewModel(application, workoutId) },
            )
            val exercises by viewModel.exercises.collectAsState()
            ExerciseListScreen(
                exercises = exercises,
                onOpen = { workoutExerciseId ->
                    navController.navigate(ROUTE_EXERCISE.replace("{$ARG_WORKOUT_EXERCISE_ID}", workoutExerciseId))
                },
            )
        }

        composable(
            route = ROUTE_EXERCISE,
            arguments = listOf(navArgument(ARG_WORKOUT_EXERCISE_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val workoutExerciseId = backStackEntry.arguments?.getString(ARG_WORKOUT_EXERCISE_ID).orEmpty()
            val viewModel: ExerciseDetailViewModel = viewModel(
                factory = SimpleViewModelFactory { ExerciseDetailViewModel(application, workoutExerciseId) },
            )
            ExerciseDetailScreen(viewModel)
        }
    }
}
