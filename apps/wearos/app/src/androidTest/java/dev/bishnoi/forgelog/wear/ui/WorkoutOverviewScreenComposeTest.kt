package dev.bishnoi.forgelog.wear.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkoutOverviewScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun showsProgressAndRequiresConfirmationBeforeDiscard() {
        var finished = false
        var discarded = false

        compose.setContent {
            WorkoutOverviewScreen(
                exercises = listOf(
                    ExerciseProgress("we1", "Bench Press", completedSets = 1, totalSets = 3, isCurrent = true),
                    ExerciseProgress("we2", "Plank", completedSets = 0, totalSets = 2, isCurrent = false),
                ),
                elapsedSeconds = 125,
                onOpenExercise = {},
                onFinish = { finished = true },
                onDiscard = { discarded = true },
            )
        }

        compose.scrollToText("2:05")
        compose.onNodeWithText("2:05").assertIsDisplayed()
        compose.onNodeWithText("Bench Press").assertIsDisplayed()
        compose.onNodeWithText("1/3 sets").assertIsDisplayed()
        compose.scrollToText("Plank")
        compose.onNodeWithText("0/2 sets").assertIsDisplayed()

        compose.scrollToText("Finish Workout")
        compose.onNodeWithText("Finish Workout").assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(finished) }

        compose.scrollToText("Discard Workout")
        compose.onNodeWithText("Discard Workout").assertIsDisplayed().performClick()
        compose.runOnIdle { assertFalse(discarded) }
        compose.onNodeWithText("Confirm discard").assertIsDisplayed()

        compose.onNodeWithText("Confirm discard").performClick()
        compose.runOnIdle { assertTrue(discarded) }
    }
}
