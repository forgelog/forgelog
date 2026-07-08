package com.forgelog.wear.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.forgelog.wear.data.AppDatabase
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class ExerciseListItem(val workoutExerciseId: String, val name: String)

/** Screen 2 per docs/wearos-scope.md: shown once a workout is active. */
class ExerciseListViewModel(application: Application, private val workoutId: String) : AndroidViewModel(application) {
    private val db = AppDatabase.get(application)

    val exercises: StateFlow<List<ExerciseListItem>> = db.workoutDao()
        .observeWorkoutExercises(workoutId)
        .map { list ->
            list.map { we ->
                val exercise = db.referenceDao().exercise(we.exerciseId)
                ExerciseListItem(we.id, exercise?.name ?: we.exerciseId)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
