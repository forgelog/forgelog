package dev.bishnoi.forgelog.wear.logic

enum class ExerciseType(val value: String) {
    WEIGHT_REPS("weight_reps"),
    REPS_ONLY("reps_only"),
    WEIGHTED_BODYWEIGHT("weighted_bodyweight"),
    ASSISTED_BODYWEIGHT("assisted_bodyweight"),
    DURATION("duration"),
    DURATION_WEIGHT("duration_weight"),
    DISTANCE_DURATION("distance_duration"),
    WEIGHT_DISTANCE("weight_distance");

    companion object {
        fun fromValue(value: String?): ExerciseType? = entries.find { it.value == value }
    }
}

data class ExerciseTypeField(
    val key: String,
    val label: String,
)

fun requireExerciseType(value: String?): ExerciseType =
    ExerciseType.fromValue(value)
        ?: throw IllegalArgumentException("Missing or invalid exercise_type: ${value ?: "null"}")

fun fieldsForExerciseType(type: ExerciseType): List<ExerciseTypeField> = when (type) {
    ExerciseType.WEIGHT_REPS -> listOf(weightField(), repsField())
    ExerciseType.REPS_ONLY -> listOf(repsField())
    ExerciseType.WEIGHTED_BODYWEIGHT -> listOf(addedWeightField(), repsField())
    ExerciseType.ASSISTED_BODYWEIGHT -> listOf(assistanceField(), repsField())
    ExerciseType.DURATION -> listOf(durationField())
    ExerciseType.DURATION_WEIGHT -> listOf(weightField(), durationField())
    ExerciseType.DISTANCE_DURATION -> listOf(distanceField(), durationField())
    ExerciseType.WEIGHT_DISTANCE -> listOf(weightField(), distanceField())
}

private fun weightField() = ExerciseTypeField("weight", "Weight")
private fun addedWeightField() = ExerciseTypeField("weight", "Added")
private fun assistanceField() = ExerciseTypeField("weight", "Assist")
private fun repsField() = ExerciseTypeField("reps", "Reps")
private fun durationField() = ExerciseTypeField("duration", "Time")
private fun distanceField() = ExerciseTypeField("distance", "Distance")
