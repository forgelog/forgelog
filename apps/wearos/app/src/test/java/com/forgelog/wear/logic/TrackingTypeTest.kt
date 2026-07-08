package com.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackingTypeTest {

    @Test
    fun `override wins when present`() {
        assertEquals(
            TrackingType.DURATION,
            effectiveTrackingType("duration", "weight_reps")
        )
    }

    @Test
    fun `falls back to catalog default when override is null`() {
        assertEquals(
            TrackingType.REPS_ONLY,
            effectiveTrackingType(null, "reps_only")
        )
    }

    @Test
    fun `defaults to weight_reps when both are null`() {
        assertEquals(TrackingType.WEIGHT_REPS, effectiveTrackingType(null, null))
    }

    @Test
    fun `unknown values are treated as absent`() {
        assertEquals(TrackingType.WEIGHT_REPS, effectiveTrackingType("bogus", null))
    }
}
