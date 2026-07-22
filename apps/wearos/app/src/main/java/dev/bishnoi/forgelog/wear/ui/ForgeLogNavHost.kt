package dev.bishnoi.forgelog.wear.ui

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import dev.bishnoi.forgelog.wear.application.FinishWorkout
import dev.bishnoi.forgelog.wear.data.WearStoreProvider
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

    val stores = remember { WearStoreProvider.get(application) }
    val references = stores.references
    val workoutRepository = stores.workouts
    val finishWorkout = remember {
        FinishWorkout(workoutRepository, publish = { payload ->
            WearDataClient.publishWorkout(application, payload)
        })
    }

    LaunchedEffect(Unit) {
        finishWorkout.drainPending()
    }

    SwipeDismissableNavHost(navController = navController, startDestination = WearRoutes.ROUTINES) {
        composable(WearRoutes.ROUTINES) {
            val vm: RoutineListViewModel = viewModel(
                factory = SimpleViewModelFactory {
                    RoutineListViewModel(references, workoutRepository, syncWithPhone = {
                        val sent = SyncRequestClient.requestSync(application)
                        finishWorkout.drainPending()
                        sent
                    })
                },
            )
            LaunchedEffect(vm) { vm.requestSyncIfNeeded() }
            val routines by vm.routines.collectAsState()
            val activeWorkout by vm.activeWorkout.collectAsState()
            val workoutStorageError by vm.workoutStorageError.collectAsState()
            val syncRequestState by vm.syncRequestState.collectAsState()
            RoutineListScreen(
                routines = routines,
                activeWorkout = activeWorkout,
                workoutStorageError = workoutStorageError,
                syncRequestState = syncRequestState,
                onOpenRoutine = { routineId ->
                    navController.navigate(WearRoutes.routineDetail(routineId))
                },
                onResumeWorkout = { workoutId -> navController.navigate(WearRoutes.workout(workoutId)) },
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
                    RoutineDetailViewModel(references, workoutRepository, routineId)
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
                    WorkoutOverviewViewModel(workoutRepository, finishWorkoutUseCase = finishWorkout, workoutId)
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
                        workoutRepository,
                        workoutExerciseId,
                    )
                },
            )
            val state by vm.uiState.collectAsState()
            val context = LocalContext.current
            val currentContext by rememberUpdatedState(context)
            LaunchedEffect(vm) {
                vm.prEvent.collect { Haptics.celebrate(currentContext) }
            }
            val setActions = remember(vm) {
                ExerciseDetailSetActions(
                    markDone = { setId -> vm.markDone(setId) },
                    updateValues = { setId, weight, reps -> vm.updateValues(setId, weight, reps) },
                    updateDuration = { setId, duration -> vm.updateDuration(setId, duration) },
                    updateDistance = { setId, distance -> vm.updateDistance(setId, distance) },
                    cycleSetType = { setId -> vm.cycleSetType(setId) },
                    removeSet = { setId -> vm.removeSet(setId) },
                )
            }
            val navigationActions = remember(vm, navController) {
                ExerciseDetailNavigationActions(
                    addSet = { vm.addSet() },
                    nextSet = { vm.nextSet() },
                    prevSet = { vm.prevSet() },
                    deleteExercise = { vm.deleteExercise { navController.popBackStack() } },
                )
            }
            ExerciseDetailScreen(
                state = state,
                setActions = setActions,
                navigationActions = navigationActions,
            )
        }
    }
}

private fun androidx.navigation.NavController.popToHome() {
    navigate(WearRoutes.ROUTINES) {
        popUpTo(WearRoutes.ROUTINES) { inclusive = true }
    }
}
