package dev.bishnoi.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class RestTest {

    @Test
    fun `per-exercise rest_seconds wins when set`() {
        assertEquals(45, resolveRestSeconds(45))
    }

    @Test
    fun `falls back to the default when rest_seconds is null`() {
        assertEquals(90, resolveRestSeconds(null))
    }

    @Test
    fun `accepts a custom default`() {
        assertEquals(60, resolveRestSeconds(null, 60))
    }
}
