package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import dev.bishnoi.forgelog.wear.logic.formatElapsed

/** Active Workout overview (issue #28 screen 3). */
@Composable
fun WorkoutOverviewScreen(
    exercises: List<ExerciseProgress>,
    elapsedSeconds: Long,
    onOpenExercise: (String) -> Unit,
    onFinish: () -> Unit,
    onDiscard: () -> Unit,
) {
    MaterialTheme {
        var confirmingDiscard by remember { mutableStateOf(false) }
        val listState = rememberScalingLazyListState()
        ScrollScaffold(listState) {
            ScalingLazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = listState,
            ) {
                item {
                    Text(
                        text = formatElapsed(elapsedSeconds),
                        style = MaterialTheme.typography.title1,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                items(exercises) { exercise ->
                    Chip(
                        label = { Text(exercise.name, maxLines = 1) },
                        secondaryLabel = {
                            Text("${exercise.completedSets}/${exercise.totalSets} sets")
                        },
                        onClick = { onOpenExercise(exercise.workoutExerciseId) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = if (exercise.isCurrent) {
                            ChipDefaults.primaryChipColors()
                        } else {
                            ChipDefaults.secondaryChipColors()
                        },
                    )
                }

                item { ListHeader { Text("Workout Options") } }
                item {
                    Chip(
                        label = { Text("Finish Workout") },
                        onClick = onFinish,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ChipDefaults.primaryChipColors(),
                    )
                }
                item {
                    if (confirmingDiscard) {
                        Chip(
                            label = { Text("Confirm discard") },
                            secondaryLabel = { Text("Deletes this workout") },
                            onClick = onDiscard,
                            modifier = Modifier.fillMaxWidth(),
                            colors = destructiveChipColors(),
                        )
                    } else {
                        Chip(
                            label = { Text("Discard Workout") },
                            onClick = { confirmingDiscard = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ChipDefaults.secondaryChipColors(),
                        )
                    }
                }
            }
        }
    }
}
