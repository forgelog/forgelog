package dev.bishnoi.forgelog.wear.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkoutMailboxSyncCoordinatorTest {
    @Test
    fun `startup applies the peer mailbox before publishing committed desired state`() = runTest {
        val initial = mailbox("initial", 1)
        val afterPeer = mailbox("after-peer", 2)
        val desired = MutableStateFlow(initial)
        val published = mutableListOf<WorkoutMailbox>()
        val coordinator = WorkoutMailboxSyncCoordinator(
            desiredMailboxes = desired,
            applyMailbox = {
                desired.value = afterPeer
                true
            },
            readPeerMailbox = {
                """{"protocol_version":1,"candidate":null,"watch_receipt":null}"""
            },
            publishMailbox = { published += it },
            logWarning = { _, _ -> },
        )

        val job = requireNotNull(coordinator.start(this))
        runCurrent()
        job.cancel()

        assertEquals(listOf(afterPeer), published)
    }

    @Test
    fun `publisher serializes writes and conflates changes to newest committed mailbox`() = runTest {
        val first = mailbox("first", 1)
        val second = mailbox("second", 2)
        val third = mailbox("third", 3)
        val desired = MutableStateFlow(first)
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val published = mutableListOf<WorkoutMailbox>()
        val coordinator = WorkoutMailboxSyncCoordinator(
            desiredMailboxes = desired,
            applyMailbox = { true },
            readPeerMailbox = { null },
            publishMailbox = {
                published += it
                if (published.size == 1) {
                    firstStarted.complete(Unit)
                    releaseFirst.await()
                }
            },
            logWarning = { _, _ -> },
        )

        val job = requireNotNull(coordinator.start(this))
        runCurrent()
        firstStarted.await()
        desired.value = second
        desired.value = third
        runCurrent()
        releaseFirst.complete(Unit)
        runCurrent()
        job.cancel()

        assertEquals(listOf(first, third), published)
    }

    @Test
    fun `a later peer event retries committed state after publication failure`() = runTest {
        val desired = MutableStateFlow(mailbox("finish", 10))
        var attempts = 0
        val coordinator = WorkoutMailboxSyncCoordinator(
            desiredMailboxes = desired,
            applyMailbox = { true },
            readPeerMailbox = { null },
            publishMailbox = {
                attempts += 1
                if (attempts == 1) error("offline")
            },
            logWarning = { _, _ -> },
        )

        val job = requireNotNull(coordinator.start(this))
        runCurrent()
        coordinator.applyPeerPayload(
            """{"protocol_version":1,"candidate":null,"watch_receipt":null}""",
        )
        runCurrent()
        job.cancel()

        assertEquals(2, attempts)
    }

    private fun mailbox(workoutId: String, changedAtMs: Long) = WorkoutMailbox(
        candidate = WorkoutReplica(
            workoutId = workoutId,
            startedAtMs = changedAtMs,
            changedAtMs = changedAtMs,
            state = WorkoutReplicaState.Discarded,
        ),
    )
}
