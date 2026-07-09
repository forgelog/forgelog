package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.CompactButton
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import dev.bishnoi.forgelog.wear.logic.TrackingType

/**
 * Screens 2/3 per docs/wearos-scope.md: one set at a time within an
 * exercise, add/remove-set actions, and the rest timer as a transient
 * full-screen state on this same screen (not a separate destination).
 */
@Composable
fun ExerciseDetailScreen(viewModel: ExerciseDetailViewModel) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(viewModel) {
        viewModel.prEvent.collect { Haptics.celebrate(context) }
    }
    LaunchedEffect(state.restRemaining) {
        if (state.restRemaining != null) Haptics.tick(context)
    }

    MaterialTheme {
        val resting = state.restRemaining
        if (resting != null) {
            RestingView(secondsRemaining = resting, onSkip = viewModel::skipRest)
        } else {
            SetEditorView(state, viewModel)
        }
    }
}

@Composable
private fun SetEditorView(state: ExerciseDetailUiState, viewModel: ExerciseDetailViewModel) {
    val set = state.sets.getOrNull(state.currentIndex)
    ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
        item { Text(state.exerciseName) }
        if (set == null) {
            item { Text("No sets yet") }
            item { CompactButton(onClick = viewModel::addSet) { Text("+ Add set") } }
        } else {
            item { Text("Set ${state.currentIndex + 1} of ${state.sets.size}") }

            if (state.trackingType == TrackingType.REPS_ONLY) {
                item { NumberRow("Reps", set.reps ?: 0) { viewModel.updateValues(set, set.weight, it) } }
            } else {
                item {
                    NumberRow("Weight (kg)", (set.weight ?: 0.0).toInt()) {
                        viewModel.updateValues(set, it.toDouble(), set.reps)
                    }
                }
                item { NumberRow("Reps", set.reps ?: 0) { viewModel.updateValues(set, set.weight, it) } }
            }

            item {
                Row {
                    Button(onClick = viewModel::prevSet, enabled = state.currentIndex > 0) { Text("<") }
                    Button(onClick = { viewModel.markDone(set) }) { Text("Done") }
                    Button(
                        onClick = viewModel::nextSet,
                        enabled = state.currentIndex < state.sets.size - 1,
                    ) { Text(">") }
                }
            }
            item {
                Row {
                    CompactButton(onClick = viewModel::addSet) { Text("+ Set") }
                    CompactButton(onClick = { viewModel.removeSet(set) }) { Text("Remove") }
                }
            }
        }
    }
}

@Composable
private fun NumberRow(label: String, value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label)
        CompactButton(onClick = { onChange((value - 1).coerceAtLeast(0)) }) { Text("-") }
        Text(value.toString())
        CompactButton(onClick = { onChange(value + 1) }) { Text("+") }
    }
}

@Composable
private fun RestingView(secondsRemaining: Int, onSkip: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Resting")
        Text("$secondsRemaining s")
        Button(onClick = onSkip) { Text("Skip") }
    }
}
