package dev.bishnoi.forgelog.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.logic.TrackingType
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExerciseDetailScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun pageZeroShowsMetricPickersForEachTrackingType() {
        var state by mutableStateOf(exerciseState(TrackingType.WEIGHT_REPS))

        compose.setContent {
            ExerciseDetailUnderTest(state = state)
        }

        compose.onNodeWithText(BENCH_PRESS).assertIsDisplayed()
        compose.onNodeWithText("Set 1 of 1").assertIsDisplayed()
        compose.assertPickerValue("kg", "80")
        compose.assertPickerValue("Reps", "8")

        compose.runOnIdle { state = exerciseState(TrackingType.REPS_ONLY) }
        compose.assertPickerValue("Reps", "8")
        compose.assertNoContentDescription("kg")
        compose.assertNoText("80")

        compose.runOnIdle { state = exerciseState(TrackingType.DURATION) }
        compose.assertPickerValue("Sec", "30")
        compose.assertNoContentDescription("Reps")
        compose.assertNoText("8")

        compose.runOnIdle { state = exerciseState(TrackingType.DURATION_DISTANCE) }
        compose.assertPickerValue("Sec", "30")
        compose.assertPickerValue("Meters", "400")
    }

    @Test
    fun pageOneShowsSetAndExerciseOptions() {
        compose.setContent {
            ExerciseDetailUnderTest(state = exerciseState(TrackingType.WEIGHT_REPS))
        }

        compose.onRoot().performTouchInput { swipeLeft() }
        compose.onNodeWithText("Set Options").assertIsDisplayed()
        compose.onNodeWithText("Add Set").assertIsDisplayed()
        compose.onNodeWithText("Set Type").assertIsDisplayed()
        compose.onNodeWithText("Normal").assertIsDisplayed()
        compose.onNodeWithText("Delete Set").assertIsDisplayed()

        compose.scrollToText("Delete Exercise")
        compose.onNodeWithText("Exercise Options").assertIsDisplayed()
        compose.onNodeWithText("Delete Exercise").assertIsDisplayed()
    }

    @Test
    fun restingOverlayCountsDownAndSkipDismissesIt() {
        var state by mutableStateOf(exerciseState(TrackingType.WEIGHT_REPS, restRemaining = 45))
        var skipped = false

        compose.setContent {
            ExerciseDetailUnderTest(
                state = state,
                onSkipRest = {
                    skipped = true
                    state = state.copy(restRemaining = null)
                },
            )
        }

        compose.onNodeWithText("Resting").assertIsDisplayed()
        compose.onNodeWithText("45 s").assertIsDisplayed()
        compose.assertNoText(BENCH_PRESS)
        compose.assertNoText("Set 1 of 1")

        compose.runOnIdle { state = state.copy(restRemaining = 44) }
        compose.onNodeWithText("44 s").assertIsDisplayed()
        compose.assertNoText("45 s")

        compose.onNodeWithText("Skip").assertIsDisplayed().performClick()

        compose.runOnIdle { assertTrue(skipped) }
        compose.assertNoText("Resting")
        compose.assertNoText("44 s")
    }
}

private fun exerciseState(
    trackingType: TrackingType,
    restRemaining: Int? = null,
) = ExerciseDetailUiState(
    exerciseName = BENCH_PRESS,
    trackingType = trackingType,
    sets = listOf(
        SetRow(
            id = "s1",
            setType = "normal",
            weight = 80.0,
            reps = 8,
            durationSeconds = 30,
            distanceMeters = 400.0,
            completed = false,
        ),
    ),
    currentIndex = 0,
    restRemaining = restRemaining,
)

private const val BENCH_PRESS = "Bench Press"

@Composable
private fun ExerciseDetailUnderTest(
    state: ExerciseDetailUiState,
    onSkipRest: () -> Unit = {},
) {
    ExerciseDetailScreen(
        state = state,
        setActions = ExerciseDetailSetActions(
            markDone = {},
            updateValues = { _, _, _ -> },
            updateDuration = { _, _ -> },
            updateDistance = { _, _ -> },
            cycleSetType = {},
            removeSet = {},
        ),
        navigationActions = ExerciseDetailNavigationActions(
            addSet = {},
            nextSet = {},
            prevSet = {},
            skipRest = onSkipRest,
            deleteExercise = {},
        ),
    )
}
