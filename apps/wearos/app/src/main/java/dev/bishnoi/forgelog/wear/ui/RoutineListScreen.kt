package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import dev.bishnoi.forgelog.wear.data.RoutineEntity

/** Screen 1 per docs/wearos-scope.md: pick a routine to start a workout. */
@Composable
fun RoutineListScreen(routines: List<RoutineEntity>, onStart: (String) -> Unit) {
    MaterialTheme {
        if (routines.isEmpty()) {
            // Companion-required, no watch-side routine creation (see #7/#8): a
            // fresh install has nothing until the phone app syncs a snapshot.
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("No routines yet", textAlign = TextAlign.Center)
                Text(
                    "Sync from ForgeLog on your phone to start training.",
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
                item { Text("ForgeLog") }
                items(routines) { routine ->
                    Chip(label = { Text(routine.name) }, onClick = { onStart(routine.id) })
                }
            }
        }
    }
}
