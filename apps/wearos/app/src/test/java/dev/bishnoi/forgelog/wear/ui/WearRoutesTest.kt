package dev.bishnoi.forgelog.wear.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class WearRoutesTest {

    @Test
    fun `route builders fill in the templated argument`() {
        assertEquals("routine/r1", WearRoutes.routineDetail("r1"))
        assertEquals("workout/w1", WearRoutes.workout("w1"))
        assertEquals("exercise/we1", WearRoutes.exercise("we1"))
    }

    @Test
    fun `templates and builders agree on the same prefix`() {
        assertEquals(
            WearRoutes.ROUTINE_DETAIL.substringBefore("/{"),
            WearRoutes.routineDetail("x").substringBefore("/"),
        )
        assertEquals(
            WearRoutes.WORKOUT.substringBefore("/{"),
            WearRoutes.workout("x").substringBefore("/"),
        )
        assertEquals(
            WearRoutes.EXERCISE.substringBefore("/{"),
            WearRoutes.exercise("x").substringBefore("/"),
        )
    }
}
