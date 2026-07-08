package com.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PersonalRecordsTest {

    @Test
    fun `epley 1RM formula`() {
        assertEquals(100.0, estimatedOneRepMax(100.0, 0), 0.001)
        assertEquals(200.0, estimatedOneRepMax(100.0, 30), 0.001)
    }

    @Test
    fun `computes maxes across completed sets`() {
        val records = computeRecords(
            listOf(
                SetPerformance(100.0, 5),
                SetPerformance(120.0, 3),
                SetPerformance(80.0, 10),
            )
        )
        assertEquals(120.0, records[RecordType.MAX_WEIGHT])
        assertEquals(10.0, records[RecordType.MAX_REPS])
        assertEquals(800.0, records[RecordType.MAX_VOLUME]) // 80 * 10
        assertEquals(estimatedOneRepMax(120.0, 3), records[RecordType.EST_1RM]!!, 0.001)
    }

    @Test
    fun `reps-only sets produce max_reps but no weight-based records`() {
        val records = computeRecords(
            listOf(
                SetPerformance(null, 15),
                SetPerformance(null, 20),
            )
        )
        assertEquals(20.0, records[RecordType.MAX_REPS])
        assertNull(records[RecordType.MAX_WEIGHT])
        assertNull(records[RecordType.MAX_VOLUME])
        assertNull(records[RecordType.EST_1RM])
    }

    @Test
    fun `empty set list produces no records`() {
        assertTrue(computeRecords(emptyList()).isEmpty())
    }

    @Test
    fun `record types with no baseline always count as improved`() {
        val improved = improvedRecords(
            candidate = mapOf(RecordType.MAX_WEIGHT to 100.0),
            baseline = emptyMap(),
        )
        assertEquals(listOf(RecordType.MAX_WEIGHT), improved)
    }

    @Test
    fun `only strictly greater values count as improved`() {
        val improved = improvedRecords(
            candidate = mapOf(RecordType.MAX_WEIGHT to 100.0, RecordType.MAX_REPS to 5.0),
            baseline = mapOf(RecordType.MAX_WEIGHT to 120.0, RecordType.MAX_REPS to 5.0),
        )
        assertTrue(improved.isEmpty())
    }

    @Test
    fun `strictly greater candidate values are reported`() {
        val improved = improvedRecords(
            candidate = mapOf(RecordType.MAX_WEIGHT to 130.0),
            baseline = mapOf(RecordType.MAX_WEIGHT to 120.0),
        )
        assertEquals(listOf(RecordType.MAX_WEIGHT), improved)
    }
}
