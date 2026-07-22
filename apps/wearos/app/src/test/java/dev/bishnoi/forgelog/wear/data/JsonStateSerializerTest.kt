package dev.bishnoi.forgelog.wear.data

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class JsonStateSerializerTest {
    @Test
    fun `reference state round trips and ignores additive fields`() = runBlocking {
        val state = ReferenceState(receivedAtEpochMillis = 123L)
        val output = ByteArrayOutputStream()
        ReferenceStateSerializer.writeTo(state, output)

        val encodedWithUnknownField = output.toString(Charsets.UTF_8.name())
            .dropLast(1) + ",\"future_field\":true}"

        assertEquals(
            state,
            ReferenceStateSerializer.readFrom(ByteArrayInputStream(encodedWithUnknownField.toByteArray())),
        )
    }

    @Test
    fun `unsupported local format versions are corrupt rather than silently accepted`() {
        assertThrows(CorruptionException::class.java) {
            runBlocking {
                ReferenceStateSerializer.readFrom(ByteArrayInputStream("{\"formatVersion\":99}".toByteArray()))
            }
        }
        assertThrows(CorruptionException::class.java) {
            runBlocking {
                WorkoutStateSerializer.readFrom(ByteArrayInputStream("{\"formatVersion\":99}".toByteArray()))
            }
        }
    }

    @Test
    fun `corrupt reference file resets while corrupt workout file remains untouched`() = runBlocking {
        val directory = Files.createTempDirectory("wear-corruption").toFile()
        val referenceFile = File(directory, "reference-state.json").apply { writeText("not-json") }
        val workoutFile = File(directory, "workout-state.json").apply { writeText("not-json") }
        val referenceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val workoutScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val referenceStore = DataStoreFactory.create(
                serializer = ReferenceStateSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler { ReferenceState() },
                scope = referenceScope,
                produceFile = { referenceFile },
            )
            val workoutStore = DataStoreFactory.create(
                serializer = WorkoutStateSerializer,
                scope = workoutScope,
                produceFile = { workoutFile },
            )

            assertEquals(ReferenceState(), referenceStore.data.first())
            assertThrows(CorruptionException::class.java) {
                runBlocking { workoutStore.data.first() }
            }
            assertEquals("not-json", workoutFile.readText())
        } finally {
            referenceScope.cancel()
            workoutScope.cancel()
            directory.deleteRecursively()
        }
    }
}
