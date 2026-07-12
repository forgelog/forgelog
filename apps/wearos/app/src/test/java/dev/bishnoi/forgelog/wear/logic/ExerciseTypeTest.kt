package dev.bishnoi.forgelog.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ExerciseTypeTest {

    @Test
    fun `parses only canonical exercise types`() {
        val values = ExerciseType.entries.map { it.value }
        assertEquals(
            listOf(
                "weight_reps",
                "reps_only",
                "weighted_bodyweight",
                "assisted_bodyweight",
                "duration",
                "duration_weight",
                "distance_duration",
                "weight_distance",
            ),
            values,
        )

        for (type in ExerciseType.entries) {
            assertEquals(type, ExerciseType.fromValue(type.value))
        }
        assertNull(ExerciseType.fromValue(null))
        assertNull(ExerciseType.fromValue("distance_duration_old"))
    }

    @Test
    fun `requireExerciseType rejects missing or invalid values`() {
        assertEquals(ExerciseType.WEIGHTED_BODYWEIGHT, requireExerciseType("weighted_bodyweight"))
        assertThrows(IllegalArgumentException::class.java) { requireExerciseType(null) }
        assertThrows(IllegalArgumentException::class.java) { requireExerciseType("bogus") }
    }

    @Test
    fun `fields mirror mobile labels and order`() {
        assertEquals(listOf("Weight", "Reps"), fieldsForExerciseType(ExerciseType.WEIGHT_REPS).map { it.label })
        assertEquals(listOf("Reps"), fieldsForExerciseType(ExerciseType.REPS_ONLY).map { it.label })
        assertEquals(listOf("Added", "Reps"), fieldsForExerciseType(ExerciseType.WEIGHTED_BODYWEIGHT).map { it.label })
        assertEquals(listOf("Assist", "Reps"), fieldsForExerciseType(ExerciseType.ASSISTED_BODYWEIGHT).map { it.label })
        assertEquals(listOf("Time"), fieldsForExerciseType(ExerciseType.DURATION).map { it.label })
        assertEquals(listOf("Weight", "Time"), fieldsForExerciseType(ExerciseType.DURATION_WEIGHT).map { it.label })
        assertEquals(listOf("Distance", "Time"), fieldsForExerciseType(ExerciseType.DISTANCE_DURATION).map { it.label })
        assertEquals(listOf("Weight", "Distance"), fieldsForExerciseType(ExerciseType.WEIGHT_DISTANCE).map { it.label })
    }
}
