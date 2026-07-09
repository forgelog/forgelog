package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
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
        ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
            item { Text("ForgeLog") }
            items(routines) { routine ->
                Chip(label = { Text(routine.name) }, onClick = { onStart(routine.id) })
            }
        }
    }
}
