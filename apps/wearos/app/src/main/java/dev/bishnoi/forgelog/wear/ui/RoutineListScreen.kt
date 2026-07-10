package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

private fun syncButtonLabel(state: SyncRequestState): String = when (state) {
    SyncRequestState.IDLE -> "Sync Routines"
    SyncRequestState.SENDING -> "Requesting sync…"
    SyncRequestState.SENT -> "Sync requested"
    SyncRequestState.FAILED -> "Phone not reachable"
}

private fun exerciseCountLabel(count: Int): String =
    if (count == 1) "1 exercise" else "$count exercises"

/** Home screen (issue #28 "Home / Start"): pick a routine, then open its detail. */
@Composable
fun RoutineListScreen(
    routines: List<RoutineListItem>,
    syncRequestState: SyncRequestState = SyncRequestState.IDLE,
    onOpenRoutine: (String) -> Unit,
    onRequestSync: () -> Unit = {},
) {
    MaterialTheme {
        if (routines.isEmpty()) {
            // Companion-required, no watch-side routine creation (see #7/#8): a
            // fresh install has nothing until the phone app syncs a snapshot.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "No routines yet",
                    style = MaterialTheme.typography.title3,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "Sync from ForgeLog on your phone to start training.",
                    style = MaterialTheme.typography.caption2,
                    textAlign = TextAlign.Center,
                )
                Chip(
                    label = { Text(syncButtonLabel(syncRequestState)) },
                    onClick = onRequestSync,
                    enabled = syncRequestState != SyncRequestState.SENDING,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ChipDefaults.primaryChipColors(),
                )
            }
        } else {
            val listState = rememberScalingLazyListState()
            ScrollScaffold(listState) {
                ScalingLazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = listState,
                ) {
                    item { ListHeader { Text("Routines") } }
                    items(routines) { routine ->
                        Chip(
                            label = { Text(routine.name, maxLines = 1) },
                            secondaryLabel = { Text(exerciseCountLabel(routine.exerciseCount)) },
                            onClick = { onOpenRoutine(routine.id) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ChipDefaults.secondaryChipColors(),
                        )
                    }
                }
            }
        }
    }
}
