package dev.bishnoi.forgelog.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.test.ext.junit.runners.AndroidJUnit4
import dev.bishnoi.forgelog.wear.logic.TrackingType
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearScreenComposeTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun routineList_emptyState_showsSyncChipForEachRequestState() {
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
    fun routineList_populatedState_showsRoutineNamesAndExerciseCounts() {
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

    @Test
    fun routineDetail_showsRoutinePreviewAndStartsWorkout() {
        var started = false

        compose.setContent {
            RoutineDetailScreen(
                state = RoutineDetailUiState(
                    name = "Strength A",
                    exercises = listOf(
                        RoutineExercisePreview("Bench Press", 3),
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
        compose.scrollToText("Bench Press")
        compose.onNodeWithText("Bench Press").assertIsDisplayed()
        compose.onNodeWithText("3 Sets").assertIsDisplayed()
        compose.scrollToText("Plank")
        compose.onNodeWithText("Plank").assertIsDisplayed()
        compose.onNodeWithText("1 Set").assertIsDisplayed()
    }

    @Test
    fun workoutOverview_showsProgressAndRequiresConfirmationBeforeDiscard() {
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

    @Test
    fun exerciseDetail_pageZeroShowsMetricPickersForEachTrackingType() {
        var state by mutableStateOf(exerciseState(TrackingType.WEIGHT_REPS))

        compose.setContent {
            ExerciseDetailUnderTest(state = state)
        }

        compose.onNodeWithText("Bench Press").assertIsDisplayed()
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
    fun exerciseDetail_pageOneShowsSetAndExerciseOptions() {
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
    fun exerciseDetail_restingOverlayCountsDownAndSkipDismissesIt() {
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
        compose.assertNoText("Bench Press")
        compose.assertNoText("Set 1 of 1")

        compose.runOnIdle { state = state.copy(restRemaining = 44) }
        compose.onNodeWithText("44 s").assertIsDisplayed()
        compose.assertNoText("45 s")

        compose.onNodeWithText("Skip").assertIsDisplayed().performClick()

        compose.runOnIdle { assertTrue(skipped) }
        compose.assertNoText("Resting")
        compose.assertNoText("44 s")
    }

    private fun ComposeContentTestRule.scrollToText(text: String) {
        onAllNodes(hasScrollAction())
            .onFirst()
            .performScrollToNode(hasText(text))
    }

    private fun ComposeContentTestRule.assertNoContentDescription(
        contentDescription: String,
    ) {
        val matchingNodes = onAllNodes(
            hasContentDescription(contentDescription),
            useUnmergedTree = true,
        ).fetchSemanticsNodes()
        assertTrue(matchingNodes.isEmpty())
    }

    private fun ComposeContentTestRule.assertNoText(text: String) {
        val matchingNodes = onAllNodes(hasText(text)).fetchSemanticsNodes()
        assertTrue(matchingNodes.isEmpty())
    }

    private fun ComposeContentTestRule.assertPickerValue(
        label: String,
        value: String,
    ) {
        onNode(hasContentDescription(label), useUnmergedTree = true).assertIsDisplayed()
        val expected = "$label $value"
        val matchingNodes = onAllNodes(
            hasContentDescription(label),
            useUnmergedTree = true,
        ).fetchSemanticsNodes()
        assertTrue(
            "Expected $label picker to expose state description $expected",
            matchingNodes.any { node ->
                node.config.getOrNull(SemanticsProperties.StateDescription) == expected
            },
        )
    }
}

private fun exerciseState(
    trackingType: TrackingType,
    restRemaining: Int? = null,
) = ExerciseDetailUiState(
    exerciseName = "Bench Press",
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

@Composable
private fun ExerciseDetailUnderTest(
    state: ExerciseDetailUiState,
    onSkipRest: () -> Unit = {},
) {
    ExerciseDetailScreen(
        state = state,
        onMarkDone = {},
        onUpdateValues = { _, _, _ -> },
        onUpdateDuration = { _, _ -> },
        onUpdateDistance = { _, _ -> },
        onCycleSetType = {},
        onRemoveSet = {},
        onAddSet = {},
        onNextSet = {},
        onPrevSet = {},
        onSkipRest = onSkipRest,
        onDeleteExercise = {},
    )
}
