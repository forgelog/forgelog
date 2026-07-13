package dev.bishnoi.forgelog.wear.logic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PersonalRecordsTest {

    private fun fixtureText(name: String): String =
        checkNotNull(javaClass.classLoader!!.getResourceAsStream(name)) { "fixture not found: $name" }
            .bufferedReader().readText()

    private fun loadSets(key: String): List<SetPerformance> {
        val root = Json.parseToJsonElement(fixtureText("personal-records.json")).jsonObject
        val exerciseType = if (key == "reps_only_sets") ExerciseType.REPS_ONLY else ExerciseType.WEIGHT_REPS
        return root.getValue(key).jsonArray.map { elem ->
            val obj = elem.jsonObject
            SetPerformance(
                weight = obj["weight"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.double,
                reps = obj.getValue("reps").jsonPrimitive.int,
                exerciseType = exerciseType,
            )
        }
    }

    @Test
    fun `estimated 1RM uses supported rep percentage table`() {
        assertEquals(133.333, estimatedOneRepMax(100.0, 10)!!, 0.001)
        assertNull(estimatedOneRepMax(100.0, 16))
    }

    @Test
    fun `computes maxes across completed sets`() {
        val records = computeRecords(loadSets("weighted_sets"))
        assertEquals(120.0, records[RecordType.MAX_WEIGHT])
        assertNull(records[RecordType.MAX_REPS])
        assertEquals(800.0, records[RecordType.MAX_VOLUME]) // 80 * 10
        assertEquals(estimatedOneRepMax(120.0, 3)!!, records.getValue(RecordType.EST_1RM), 0.001)
    }

    @Test
    fun `reps-only sets produce max_reps but no weight-based records`() {
        val records = computeRecords(loadSets("reps_only_sets"))
        assertEquals(20.0, records[RecordType.MAX_REPS])
        assertNull(records[RecordType.MAX_WEIGHT])
        assertNull(records[RecordType.MAX_VOLUME])
        assertNull(records[RecordType.EST_1RM])
    }

    @Test
    fun `weighted bodyweight tracks added weight but skips load metrics without bodyweight`() {
        val records = computeRecords(
            listOf(
                SetPerformance(
                    weight = 20.0,
                    reps = 10,
                    exerciseType = ExerciseType.WEIGHTED_BODYWEIGHT,
                ),
            ),
        )

        assertEquals(20.0, records[RecordType.MAX_WEIGHT])
        assertNull(records[RecordType.MAX_VOLUME])
        assertNull(records[RecordType.EST_1RM])
    }

    @Test
    fun `empty set list produces no records`() {
        assertTrue(computeRecords(emptyList()).isEmpty())
    }

    @Test
    fun `record types with no baseline do not count as improved`() {
        val improved = improvedRecords(
            candidate = mapOf(RecordType.MAX_WEIGHT to 100.0),
            baseline = emptyMap(),
        )
        assertEquals(emptyList<RecordType>(), improved)
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
