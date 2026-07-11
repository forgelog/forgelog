package dev.bishnoi.forgelog.wear.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoutineDetailScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun showsRoutinePreviewAndStartsWorkout() {
        var started = false

        compose.setContent {
            RoutineDetailScreen(
                state = RoutineDetailUiState(
                    name = "Strength A",
                    exercises = listOf(
                        RoutineExercisePreview(BENCH_PRESS, 3),
                        RoutineExercisePreview("Plank", 1),
                    ),
                ),
                onStartWorkout = { started = true },
            )
        }

        compose.onNodeWithText("Strength A").assertIsDisplayed()
        compose.onNodeWithText("Start Workout").assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(started) }
        compose.onNodeWithText("2 Exercises").assertIsDisplayed()
        compose.scrollToText(BENCH_PRESS)
        compose.onNodeWithText(BENCH_PRESS).assertIsDisplayed()
        compose.onNodeWithText("3 Sets").assertIsDisplayed()
        compose.scrollToText("Plank")
        compose.onNodeWithText("Plank").assertIsDisplayed()
        compose.onNodeWithText("1 Set").assertIsDisplayed()
    }
}

private const val BENCH_PRESS = "Bench Press"
