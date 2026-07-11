package dev.bishnoi.forgelog.wear.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
class RoutineListScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun emptyState_showsSyncChipForEachRequestState() {
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
    fun populatedState_showsRoutineNamesAndExerciseCounts() {
        var openedRoutine: String? = null

        compose.setContent {
            RoutineListScreen(
                routines = listOf(
                    RoutineListItem("push", "Push Day", 3),
                    RoutineListItem("pull", "Pull Day", 1),
                ),
                onOpenRoutine = { openedRoutine = it },
            )
        }

        compose.onNodeWithText("Routines").assertIsDisplayed()
        compose.onNodeWithText("Push Day").assertIsDisplayed()
        compose.onNodeWithText("3 exercises").assertIsDisplayed()
        compose.scrollToText("Pull Day")
        compose.onNodeWithText("Pull Day").assertIsDisplayed().performClick()
        compose.runOnIdle { assertTrue(openedRoutine == "pull") }
        compose.onNodeWithText("1 exercise").assertIsDisplayed()
    }
}
