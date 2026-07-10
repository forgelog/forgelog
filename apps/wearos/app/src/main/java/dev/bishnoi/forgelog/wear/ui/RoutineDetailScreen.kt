package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

private fun setCountLabel(count: Int): String = if (count == 1) "1 Set" else "$count Sets"

/** Routine screen (issue #28 "Routine"): name, Start Workout, then a read-only exercise list. */
@Composable
fun RoutineDetailScreen(
    state: RoutineDetailUiState,
    onStartWorkout: () -> Unit,
) {
    MaterialTheme {
        val listState = rememberScalingLazyListState()
        ScrollScaffold(listState) {
            ScalingLazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = listState,
            ) {
                item { MarqueeText(state.name, style = MaterialTheme.typography.title2) }
                item {
                    Chip(
                        label = { Text("Start Workout") },
                        onClick = onStartWorkout,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ChipDefaults.primaryChipColors(),
                    )
                }
                item {
                    Text(
                        text = if (state.exercises.size == 1) "1 Exercise" else "${state.exercises.size} Exercises",
                        style = MaterialTheme.typography.caption1,
                        color = MaterialTheme.colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                items(state.exercises) { exercise ->
                    ExercisePreviewRow(exercise)
                }
            }
        }
    }
}

@Composable
private fun ExercisePreviewRow(exercise: RoutineExercisePreview) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colors.surface),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                exercise.name.take(1).uppercase(),
                style = MaterialTheme.typography.button,
                color = MaterialTheme.colors.onSurface,
            )
        }
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                exercise.name,
                style = MaterialTheme.typography.body1,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                setCountLabel(exercise.setCount),
                style = MaterialTheme.typography.caption2,
                color = MaterialTheme.colors.onSurfaceVariant,
            )
        }
    }
}
