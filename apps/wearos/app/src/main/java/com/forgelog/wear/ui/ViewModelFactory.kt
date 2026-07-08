package com.forgelog.wear.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras

/** Route-scoped ViewModels take constructor args (workoutId, etc.) that the default factory can't provide. */
class SimpleViewModelFactory<VM : ViewModel>(private val create: () -> VM) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T = create() as T
}
