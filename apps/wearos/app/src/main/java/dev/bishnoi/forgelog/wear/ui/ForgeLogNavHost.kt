package dev.bishnoi.forgelog.wear.ui

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.AppDatabase
import dev.bishnoi.forgelog.wear.data.PersonalRecordsTracker
import dev.bishnoi.forgelog.wear.data.WorkoutRepository
import dev.bishnoi.forgelog.wear.sync.SyncRepository
import dev.bishnoi.forgelog.wear.sync.SyncRequestClient
import dev.bishnoi.forgelog.wear.sync.WearDataClient

/**
 * Watch navigation (issue #28): Home routine list -> Routine detail -> Active
 * Workout overview -> per-exercise logging. Swipe-to-dismiss pops back up the
 * stack; finishing/discarding a workout pops straight to Home.
 */
@Composable
fun ForgeLogNavHost() {
    val navController = rememberSwipeDismissableNavController()
    val application = LocalContext.current.applicationContext as Application

    val db = remember { AppDatabase.get(application) }
    val workoutDao = remember { db.workoutDao() }
    val referenceDao = remember { db.referenceDao() }
    val workoutRepository = remember { WorkoutRepository(workoutDao, referenceDao) }
    val syncRepository = remember { SyncRepository(referenceDao, workoutDao) }
    val finishWorkout = remember {
        FinishWorkout(workoutRepository, syncRepository, workoutDao) { payload ->
            WearDataClient.publishWorkout(application, payload)
        }
    }

    LaunchedEffect(Unit) {
        finishWorkout.drainUnsynced()
    }

    SwipeDismissableNavHost(navController = navController, startDestination = WearRoutes.ROUTINES) {
        composable(WearRoutes.ROUTINES) {
            val vm: RoutineListViewModel = viewModel(
                factory = SimpleViewModelFactory {
                    RoutineListViewModel(referenceDao, syncWithPhone = { SyncRequestClient.requestSync(application) })
                },
            )
            val routines by vm.routines.collectAsState()
            val syncRequestState by vm.syncRequestState.collectAsState()
            RoutineListScreen(
                routines = routines,
                syncRequestState = syncRequestState,
                onOpenRoutine = { routineId ->
                    navController.navigate(WearRoutes.routineDetail(routineId))
                },
                onRequestSync = { vm.requestSync() },
            )
        }

        composable(
            route = WearRoutes.ROUTINE_DETAIL,
            arguments = listOf(navArgument(WearRoutes.ARG_ROUTINE_ID) { type = NavType.StringType }),
        ) { entry ->
            val routineId = entry.arguments?.getString(WearRoutes.ARG_ROUTINE_ID).orEmpty()
            val vm: RoutineDetailViewModel = viewModel(
                factory = SimpleViewModelFactory {
                    RoutineDetailViewModel(referenceDao, workoutRepository, routineId)
                },
            )
            val state by vm.uiState.collectAsState()
            RoutineDetailScreen(
                state = state,
                onStartWorkout = {
                    vm.startWorkout { workoutId ->
                        navController.navigate(WearRoutes.workout(workoutId)) {
                            popUpTo(WearRoutes.ROUTINE_DETAIL) { inclusive = true }
                        }
                    }
                },
            )
        }

        composable(
            route = WearRoutes.WORKOUT,
            arguments = listOf(navArgument(WearRoutes.ARG_WORKOUT_ID) { type = NavType.StringType }),
        ) { entry ->
            val workoutId = entry.arguments?.getString(WearRoutes.ARG_WORKOUT_ID).orEmpty()
            val vm: WorkoutOverviewViewModel = viewModel(
                factory = SimpleViewModelFactory {
                    WorkoutOverviewViewModel(workoutDao, referenceDao, workoutRepository, finishWorkout, workoutId)
                },
            )
            val exercises by vm.exercises.collectAsState()
            val elapsed by vm.elapsedSeconds.collectAsState()
            WorkoutOverviewScreen(
                exercises = exercises,
                elapsedSeconds = elapsed,
                onOpenExercise = { workoutExerciseId ->
                    navController.navigate(WearRoutes.exercise(workoutExerciseId))
                },
                onFinish = { vm.finishWorkout { navController.popToHome() } },
                onDiscard = { vm.discardWorkout { navController.popToHome() } },
            )
        }

        composable(
            route = WearRoutes.EXERCISE,
            arguments = listOf(
                navArgument(WearRoutes.ARG_WORKOUT_EXERCISE_ID) { type = NavType.StringType },
            ),
        ) { entry ->
            val workoutExerciseId = entry.arguments
                ?.getString(WearRoutes.ARG_WORKOUT_EXERCISE_ID).orEmpty()
            val vm: ExerciseDetailViewModel = viewModel(
                factory = SimpleViewModelFactory {
                    ExerciseDetailViewModel(
                        workoutDao,
                        referenceDao,
                        workoutRepository,
                        PersonalRecordsTracker(referenceDao),
                        workoutExerciseId,
                    )
                },
            )
            ExerciseDetailScreen(
                viewModel = vm,
                onExerciseDeleted = { navController.popBackStack() },
            )
        }
    }
}

private fun androidx.navigation.NavController.popToHome() {
    navigate(WearRoutes.ROUTINES) {
        popUpTo(WearRoutes.ROUTINES) { inclusive = true }
    }
}
