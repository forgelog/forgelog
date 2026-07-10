package dev.bishnoi.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class SetTypesTest {

    @Test
    fun `cycles through every type and wraps around`() {
        assertEquals("warmup", nextSetType("normal"))
        assertEquals("dropset", nextSetType("warmup"))
        assertEquals("failure", nextSetType("dropset"))
        assertEquals("normal", nextSetType("failure"))
    }

    @Test
    fun `unknown value resets to normal`() {
        assertEquals("normal", nextSetType("bogus"))
    }

    @Test
    fun `label is blank for the default type`() {
        assertEquals("", setTypeLabel("normal"))
        assertEquals("Warmup", setTypeLabel("warmup"))
    }
}
