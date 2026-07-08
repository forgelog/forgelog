package com.forgelog.wear.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Rest-timer countdown ticks and the new-PR moment per docs/wearos-scope.md. */
object Haptics {
    fun tick(context: Context) = pulse(context, 40)
    fun confirm(context: Context) = pulse(context, 80)

    fun celebrate(context: Context) {
        vibrator(context).vibrate(VibrationEffect.createWaveform(longArrayOf(0, 80, 60, 80, 60, 120), -1))
    }

    private fun pulse(context: Context, durationMs: Long) {
        vibrator(context).vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun vibrator(context: Context): Vibrator =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
}
