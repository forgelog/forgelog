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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.drop
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
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
import dev.bishnoi.forgelog.wear.logic.TrackingType
import dev.bishnoi.forgelog.wear.logic.setTypeLabel

/**
 * Exercise logging (issue #28 screens 4a/4b): a 2-page pager — set logging with
 * scroll-wheel pickers on page 0, set/exercise options on page 1. The rest
 * timer stays a transient full-screen state on top, not a separate destination.
 */
@Composable
fun ExerciseDetailScreen(
    state: ExerciseDetailUiState,
    onMarkDone: (setId: String) -> Unit,
    onUpdateValues: (setId: String, weight: Double?, reps: Int?) -> Unit,
    onUpdateDuration: (setId: String, durationSeconds: Int?) -> Unit,
    onUpdateDistance: (setId: String, distanceMeters: Double?) -> Unit,
    onCycleSetType: (setId: String) -> Unit,
    onRemoveSet: (setId: String) -> Unit,
    onAddSet: () -> Unit,
    onNextSet: () -> Unit,
    onPrevSet: () -> Unit,
    onSkipRest: () -> Unit,
    onDeleteExercise: () -> Unit,
) {
    val context = LocalContext.current

    LaunchedEffect(state.restRemaining) {
        if (state.restRemaining != null) Haptics.tick(context)
    }

    MaterialTheme {
        val resting = state.restRemaining
        if (resting != null) {
            RestingView(secondsRemaining = resting, onSkip = onSkipRest)
        } else {
            val pagerState = rememberPagerState(pageCount = { 2 })
            Box(modifier = Modifier.fillMaxSize()) {
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                    if (page == 0) {
                        SetEditorPage(
                            state, onMarkDone, onUpdateValues, onUpdateDuration,
                            onUpdateDistance, onNextSet, onPrevSet, onAddSet,
                        )
                    } else {
                        OptionsPage(state, onCycleSetType, onRemoveSet, onAddSet, onDeleteExercise)
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
private fun SetEditorPage(
    state: ExerciseDetailUiState,
    onMarkDone: (setId: String) -> Unit,
    onUpdateValues: (setId: String, weight: Double?, reps: Int?) -> Unit,
    onUpdateDuration: (setId: String, durationSeconds: Int?) -> Unit,
    onUpdateDistance: (setId: String, distanceMeters: Double?) -> Unit,
    onNextSet: () -> Unit,
    onPrevSet: () -> Unit,
    onAddSet: () -> Unit,
) {
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
                onClick = onAddSet,
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

        MetricPickers(set, state.trackingType, onUpdateValues, onUpdateDuration, onUpdateDistance)

        Spacer(Modifier.height(8.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CompactButton(
                onClick = onPrevSet,
                enabled = state.currentIndex > 0,
            ) { Text("‹") }
            Button(onClick = { onMarkDone(set.id) }) { Text("✓") }
            CompactButton(
                onClick = onNextSet,
                enabled = state.currentIndex < state.sets.size - 1,
            ) { Text("›") }
        }
    }
}

@Composable
private fun MetricPickers(
    set: SetRow,
    trackingType: TrackingType,
    onUpdateValues: (setId: String, weight: Double?, reps: Int?) -> Unit,
    onUpdateDuration: (setId: String, durationSeconds: Int?) -> Unit,
    onUpdateDistance: (setId: String, distanceMeters: Double?) -> Unit,
) {
    val weights = remember { (0..300).toList() }
    val reps = remember { (0..50).toList() }
    val durations = remember { (0..600 step 5).toList() }
    val distances = remember { (0..5000 step 50).toList() }

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        when (trackingType) {
            TrackingType.REPS_ONLY -> {
                ValueWheel("Reps", reps, set.reps ?: 0, set.id) {
                    onUpdateValues(set.id, set.weight, it)
                }
            }
            TrackingType.DURATION -> {
                ValueWheel("Sec", durations, set.durationSeconds ?: 0, set.id) {
                    onUpdateDuration(set.id, it)
                }
            }
            TrackingType.DURATION_DISTANCE -> {
                ValueWheel("Sec", durations, set.durationSeconds ?: 0, set.id) {
                    onUpdateDuration(set.id, it)
                }
                ValueWheel("Meters", distances, (set.distanceMeters ?: 0.0).toInt(), set.id) {
                    onUpdateDistance(set.id, it.toDouble())
                }
            }
            TrackingType.WEIGHT_REPS -> {
                ValueWheel("kg", weights, (set.weight ?: 0.0).toInt(), set.id) {
                    onUpdateValues(set.id, it.toDouble(), set.reps)
                }
                ValueWheel("Reps", reps, set.reps ?: 0, set.id) {
                    onUpdateValues(set.id, set.weight, it)
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
    val pickerState = remember(resetKey, label, values) {
        PickerState(
            initialNumberOfOptions = values.size,
            initiallySelectedOption = initialIndex,
            repeatItems = false,
        )
    }
    val currentOnChange by rememberUpdatedState(onChange)
    LaunchedEffect(pickerState) {
        // drop(1) skips the initial value so we never auto-overwrite the stored set.
        snapshotFlow { pickerState.selectedOption }
            .drop(1)
            .collect { index -> currentOnChange(values[index]) }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        val selectedValue = values[pickerState.selectedOption]
        Text(
            label,
            style = MaterialTheme.typography.caption3,
            color = MaterialTheme.colors.onSurfaceVariant,
        )
        Box(
            modifier = Modifier.size(width = 56.dp, height = 72.dp),
        ) {
            Picker(
                state = pickerState,
                contentDescription = null,
                modifier = Modifier
                    .matchParentSize()
                    .semantics {
                        contentDescription = label
                        stateDescription = "$label $selectedValue"
                    },
            ) { optionIndex ->
                Text(
                    values[optionIndex].toString(),
                    style = MaterialTheme.typography.title2,
                )
            }
        }
    }
}

@Composable
private fun OptionsPage(
    state: ExerciseDetailUiState,
    onCycleSetType: (setId: String) -> Unit,
    onRemoveSet: (setId: String) -> Unit,
    onAddSet: () -> Unit,
    onDeleteExercise: () -> Unit,
) {
    val set = state.sets.getOrNull(state.currentIndex)
    val listState = rememberScalingLazyListState()
    ScrollScaffold(listState) {
        ScalingLazyColumn(modifier = Modifier.fillMaxSize(), state = listState) {
            item { ListHeader { Text("Set Options") } }
            item {
                Chip(
                    label = { Text("Add Set") },
                    onClick = onAddSet,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ChipDefaults.secondaryChipColors(),
                )
            }
            if (set != null) {
                item {
                    Chip(
                        label = { Text("Set Type") },
                        secondaryLabel = { Text(set.setType.replaceFirstChar { it.uppercase() }) },
                        onClick = { onCycleSetType(set.id) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ChipDefaults.secondaryChipColors(),
                    )
                }
                item {
                    Chip(
                        label = { Text("Delete Set") },
                        onClick = { onRemoveSet(set.id) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = destructiveChipColors(),
                    )
                }
            }

            item { ListHeader { Text("Exercise Options") } }
            item {
                Chip(
                    label = { Text("Delete Exercise") },
                    onClick = onDeleteExercise,
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
