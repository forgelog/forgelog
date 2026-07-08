package com.forgelog.wear.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.forgelog.wear.data.AppDatabase
import com.forgelog.wear.data.RoutineEntity
import com.forgelog.wear.data.WorkoutRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Screen 1 per docs/wearos-scope.md: pick a routine to start a workout. */
class RoutineListViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.get(application)
    private val workoutRepository = WorkoutRepository(db.workoutDao(), db.referenceDao())

    val routines: StateFlow<List<RoutineEntity>> = db.referenceDao()
        .observeRoutines()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun startWorkout(routineId: String, onStarted: (workoutId: String) -> Unit) {
        viewModelScope.launch {
            val workout = workoutRepository.startWorkout(routineId)
            onStarted(workout.id)
        }
    }
}
