package com.forgelog.wear.logic

import org.junit.Assert.assertTrue
import org.junit.Test

class IdsTest {

    private val v4Format = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    )

    @Test
    fun `produces the same v4 TEXT format as the phone's id() generator`() {
        repeat(20) {
            val id = newId()
            assertTrue("'$id' did not match v4 format", v4Format.matches(id))
        }
    }

    @Test
    fun `generates unique ids`() {
        val ids = (1..1000).map { newId() }
        assertTrue(ids.toSet().size == ids.size)
    }
}
