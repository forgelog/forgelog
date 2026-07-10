package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.drop
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactButton
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Picker
import androidx.wear.compose.material.PickerState
import androidx.wear.compose.material.Text
import dev.bishnoi.forgelog.wear.data.LoggedSetEntity
import dev.bishnoi.forgelog.wear.logic.TrackingType
import dev.bishnoi.forgelog.wear.logic.setTypeLabel

/**
 * Exercise logging (issue #28 screens 4a/4b): a 2-page pager — set logging with
 * scroll-wheel pickers on page 0, set/exercise options on page 1. The rest
 * timer stays a transient full-screen state on top, not a separate destination.
 */
@Composable
fun ExerciseDetailScreen(
    viewModel: ExerciseDetailViewModel,
    onExerciseDeleted: () -> Unit = {},
) {
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
            val pagerState = rememberPagerState(pageCount = { 2 })
            Box(modifier = Modifier.fillMaxSize()) {
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                    if (page == 0) {
                        SetEditorPage(state, viewModel)
                    } else {
                        OptionsPage(state, viewModel, onExerciseDeleted)
                    }
                }
                PageDots(
                    count = 2,
                    selected = pagerState.currentPage,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun PageDots(count: Int, selected: Int, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(count) { index ->
            val active = index == selected
            Box(
                modifier = Modifier
                    .size(if (active) 7.dp else 5.dp)
                    .clip(CircleShape)
                    .background(
                        if (active) MaterialTheme.colors.onBackground
                        else MaterialTheme.colors.onSurfaceVariant,
                    ),
            )
        }
    }
}

@Composable
private fun SetEditorPage(state: ExerciseDetailUiState, viewModel: ExerciseDetailViewModel) {
    val set = state.sets.getOrNull(state.currentIndex)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        MarqueeText(state.exerciseName, style = MaterialTheme.typography.title3)

        if (set == null) {
            Text("No sets yet", style = MaterialTheme.typography.body2)
            Spacer(Modifier.height(8.dp))
            Chip(
                label = { Text("Add set") },
                onClick = viewModel::addSet,
                colors = ChipDefaults.primaryChipColors(),
            )
            return@Column
        }

        val typeLabel = setTypeLabel(set.setType)
        Text(
            text = "Set ${state.currentIndex + 1} of ${state.sets.size}" +
                if (typeLabel.isNotEmpty()) " · $typeLabel" else "",
            style = MaterialTheme.typography.caption2,
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(4.dp))

        MetricPickers(set, state.trackingType, viewModel)

        Spacer(Modifier.height(8.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CompactButton(
                onClick = viewModel::prevSet,
                enabled = state.currentIndex > 0,
            ) { Text("‹") }
            Button(onClick = { viewModel.markDone(set) }) { Text("✓") }
            CompactButton(
                onClick = viewModel::nextSet,
                enabled = state.currentIndex < state.sets.size - 1,
            ) { Text("›") }
        }
    }
}

@Composable
private fun MetricPickers(
    set: LoggedSetEntity,
    trackingType: TrackingType,
    viewModel: ExerciseDetailViewModel,
) {
    val weights = remember { (0..300).toList() }
    val reps = remember { (0..50).toList() }
    val durations = remember { (0..600 step 5).toList() }
    val distances = remember { (0..5000 step 50).toList() }

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        when (trackingType) {
            TrackingType.REPS_ONLY -> {
                ValueWheel("Reps", reps, set.reps ?: 0, set.id) {
                    viewModel.updateValues(set, set.weight, it)
                }
            }
            TrackingType.DURATION -> {
                ValueWheel("Sec", durations, set.durationSeconds ?: 0, set.id) {
                    viewModel.updateDuration(set, it)
                }
            }
            TrackingType.DURATION_DISTANCE -> {
                ValueWheel("Sec", durations, set.durationSeconds ?: 0, set.id) {
                    viewModel.updateDuration(set, it)
                }
                ValueWheel("Meters", distances, (set.distanceMeters ?: 0.0).toInt(), set.id) {
                    viewModel.updateDistance(set, it.toDouble())
                }
            }
            TrackingType.WEIGHT_REPS -> {
                ValueWheel("kg", weights, (set.weight ?: 0.0).toInt(), set.id) {
                    viewModel.updateValues(set, it.toDouble(), set.reps)
                }
                ValueWheel("Reps", reps, set.reps ?: 0, set.id) {
                    viewModel.updateValues(set, set.weight, it)
                }
            }
        }
    }
}

@Composable
private fun ValueWheel(
    label: String,
    values: List<Int>,
    current: Int,
    resetKey: String,
    onChange: (Int) -> Unit,
) {
    // Snap the wheel to the closest option for display; off-grid synced targets
    // (e.g. a 63s duration on a 5s grid) stay untouched until the user scrolls.
    val initialIndex = values.indices.minByOrNull { kotlin.math.abs(values[it] - current) } ?: 0
    val pickerState = remember(resetKey) {
        PickerState(
            initialNumberOfOptions = values.size,
            initiallySelectedOption = initialIndex,
            repeatItems = false,
        )
    }
    LaunchedEffect(pickerState) {
        // drop(1) skips the initial value so we never auto-overwrite the stored set.
        snapshotFlow { pickerState.selectedOption }
            .drop(1)
            .collect { index -> onChange(values[index]) }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            label,
            style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.onSurfaceVariant,
        )
        Picker(
            state = pickerState,
            contentDescription = label,
            modifier = Modifier.size(width = 56.dp, height = 72.dp),
        ) { optionIndex ->
            Text(
                values[optionIndex].toString(),
                style = MaterialTheme.typography.title2,
            )
        }
    }
}

@Composable
private fun OptionsPage(
    state: ExerciseDetailUiState,
    viewModel: ExerciseDetailViewModel,
    onExerciseDeleted: () -> Unit,
) {
    val set = state.sets.getOrNull(state.currentIndex)
    val listState = rememberScalingLazyListState()
    ScrollScaffold(listState) {
        ScalingLazyColumn(modifier = Modifier.fillMaxSize(), state = listState) {
            item { ListHeader { Text("Set Options") } }
            item {
                Chip(
                    label = { Text("Add Set") },
                    onClick = viewModel::addSet,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
            if (set != null) {
                item {
                    Chip(
                        label = { Text("Set Type") },
                        secondaryLabel = { Text(set.setType.replaceFirstChar { it.uppercase() }) },
                        onClick = { viewModel.cycleSetType(set) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ChipDefaults.secondaryChipColors(),
                    )
                }
                item {
                    Chip(
                        label = { Text("Delete Set") },
                        onClick = { viewModel.removeSet(set) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = destructiveChipColors(),
                    )
                }
            }

            item { ListHeader { Text("Exercise Options") } }
            item {
                Chip(
                    label = { Text("Delete Exercise") },
                    onClick = { viewModel.deleteExercise(onExerciseDeleted) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = destructiveChipColors(),
                )
            }
        }
    }
}

@Composable
private fun RestingView(secondsRemaining: Int, onSkip: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Resting", style = MaterialTheme.typography.title3)
        Text("$secondsRemaining s", style = MaterialTheme.typography.display3)
        Spacer(Modifier.height(8.dp))
        Chip(
            label = { Text("Skip") },
            onClick = onSkip,
            colors = ChipDefaults.secondaryChipColors(),
        )
    }
}
