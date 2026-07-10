package dev.bishnoi.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class ElapsedTest {

    @Test
    fun `formats minutes and zero-padded seconds`() {
        assertEquals("0:00", formatElapsed(0))
        assertEquals("0:09", formatElapsed(9))
        assertEquals("1:05", formatElapsed(65))
        assertEquals("12:30", formatElapsed(750))
    }

    @Test
    fun `negative durations clamp to zero`() {
        assertEquals("0:00", formatElapsed(-5))
    }
}
