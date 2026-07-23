package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.Serializer
import dev.bishnoi.forgelog.wear.sync.syncJson
import java.io.InputStream
import java.io.OutputStream
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull

private class JsonStateSerializer<T>(
    override val defaultValue: T,
    private val serializer: KSerializer<T>,
    private val isSupported: (T) -> Boolean,
) : Serializer<T> {
    override suspend fun readFrom(input: InputStream): T {
        val state = try {
            syncJson.decodeFromString(serializer, input.bufferedReader(Charsets.UTF_8).readText())
        } catch (error: SerializationException) {
            throw CorruptionException("Unable to decode JSON state", error)
        }
        if (!isSupported(state)) {
            throw CorruptionException("Unsupported JSON state format")
        }
        return state
    }

    override suspend fun writeTo(t: T, output: OutputStream) {
        val writer = output.bufferedWriter(Charsets.UTF_8)
        writer.write(syncJson.encodeToString(serializer, t))
        writer.flush()
    }
}

val ReferenceStateSerializer: Serializer<ReferenceState> =
    JsonStateSerializer(ReferenceState(), ReferenceState.serializer()) {
        it.formatVersion == REFERENCE_STATE_FORMAT_VERSION
    }

val WorkoutStateSerializer: Serializer<WorkoutState> = object : Serializer<WorkoutState> {
    override val defaultValue = WorkoutState()

    override suspend fun readFrom(input: InputStream): WorkoutState {
        val text = input.bufferedReader(Charsets.UTF_8).readText()
        try {
            val element = syncJson.parseToJsonElement(text)
            return when (element.jsonObject["formatVersion"]?.jsonPrimitive?.intOrNull ?: 1) {
                1 -> syncJson.decodeFromJsonElement(WorkoutStateV1.serializer(), element).let { legacy ->
                    WorkoutState(
                        activeWorkout = legacy.activeWorkout,
                        pendingUploads = legacy.pendingUploads,
                        legacyMode = legacy.activeWorkout != null || legacy.pendingUploads.isNotEmpty(),
                    )
                }
                WORKOUT_STATE_FORMAT_VERSION ->
                    syncJson.decodeFromJsonElement(WorkoutState.serializer(), element)
                else -> throw CorruptionException("Unsupported JSON state format")
            }
        } catch (error: CorruptionException) {
            throw error
        } catch (error: Exception) {
            throw CorruptionException("Unable to decode JSON state", error)
        }
    }

    override suspend fun writeTo(t: WorkoutState, output: OutputStream) {
        val writer = output.bufferedWriter(Charsets.UTF_8)
        writer.write(syncJson.encodeToString(WorkoutState.serializer(), t))
        writer.flush()
    }
}
