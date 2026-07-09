package dev.bishnoi.forgelog.wear.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/** Screen 2 per docs/wearos-scope.md: shown once a workout is active; tap opens the exercise. */
@Composable
fun ExerciseListScreen(exercises: List<ExerciseListItem>, onOpen: (String) -> Unit) {
    MaterialTheme {
        ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
            items(exercises) { exercise ->
                Chip(label = { Text(exercise.name) }, onClick = { onOpen(exercise.workoutExerciseId) })
            }
        }
    }
}
