package dev.bishnoi.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class ElapsedTest {

    @Test
    fun `formats elapsed time as hours minutes and seconds`() {
        assertEquals("00:00:00", formatElapsed(0))
        assertEquals("00:00:09", formatElapsed(9))
        assertEquals("00:01:05", formatElapsed(65))
        assertEquals("00:59:59", formatElapsed(3599))
        assertEquals("01:00:00", formatElapsed(3600))
        assertEquals("01:01:01", formatElapsed(3661))
    }

    @Test
    fun `negative durations clamp to zero`() {
        assertEquals("00:00:00", formatElapsed(-5))
    }
}
