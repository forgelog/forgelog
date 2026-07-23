package dev.bishnoi.forgelog.wear.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoutineListScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun emptyStateShowsSyncChipForEachRequestState() {
        var syncState by mutableStateOf(SyncRequestState.IDLE)
        var requested = false

        compose.setContent {
            RoutineListScreen(
                routines = emptyList(),
                syncRequestState = syncState,
                onOpenRoutine = {},
                onRequestSync = { requested = true },
            )
        }

        compose.onNodeWithText("No routines yet").assertIsDisplayed()
        compose.onNodeWithText("Sync Routines").assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(requested) }

        compose.runOnIdle { syncState = SyncRequestState.SENDING }
        compose.onNodeWithText("Requesting sync…").assertIsDisplayed()

        compose.runOnIdle { syncState = SyncRequestState.SENT }
        compose.onNodeWithText("Sync requested").assertIsDisplayed()

        compose.runOnIdle { syncState = SyncRequestState.FAILED }
        compose.onNodeWithText("Phone not reachable").assertIsDisplayed()
    }

    @Test
    fun populatedStateShowsRoutineNamesAndExerciseCounts() {
        var openedRoutine: String? = null

        compose.setContent {
            RoutineListScreen(
                routines = listOf(
                    RoutineListItem("push", "Push Day", 3),
                    RoutineListItem("pull", PULL_DAY, 1),
                ),
                onOpenRoutine = { openedRoutine = it },
            )
        }

        compose.onNodeWithText("Routines").assertIsDisplayed()
        compose.onNodeWithText("Push Day").assertIsDisplayed()
        compose.onNodeWithText("3 exercises").assertIsDisplayed()
        compose.scrollToText(PULL_DAY)
        compose.onNodeWithText(PULL_DAY).assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(openedRoutine == "pull") }
        compose.onNodeWithText("1 exercise").assertIsDisplayed()
    }

    @Test
    fun activeWorkoutCanBeResumedEvenWithoutRoutines() {
        var resumedWorkout: String? = null

        compose.setContent {
            RoutineListScreen(
                routines = emptyList(),
                activeWorkout = ActiveWorkoutListItem(
                    "w1",
                    "Morning Session",
                    "2026-07-23T10:00:00Z",
                ),
                onOpenRoutine = {},
                onResumeWorkout = { resumedWorkout = it },
            )
        }

        compose.onNodeWithText("Resume Workout").assertIsDisplayed().performClick()
        compose.onNodeWithText("Morning Session").assertIsDisplayed()
        compose.onNodeWithText("Started", substring = true).assertIsDisplayed()
        compose.runOnIdle { assertTrue(resumedWorkout == "w1") }
    }

    @Test
    fun workoutStorageErrorIsVisibleAndDisablesRoutineStarts() {
        var opened = false
        compose.setContent {
            RoutineListScreen(
                routines = listOf(RoutineListItem("r1", "Push Day", 1)),
                workoutStorageError = true,
                onOpenRoutine = { opened = true },
            )
        }

        compose.onNodeWithText("Workout storage unavailable").assertIsDisplayed()
        compose.onNodeWithText("Push Day").assertIsNotEnabled()
        compose.runOnIdle { assertTrue(!opened) }
    }
}

private const val PULL_DAY = "Pull Day"
