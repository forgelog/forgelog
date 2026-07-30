package dev.bishnoi.forgelog.wear.sync

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class WorkoutMailboxSyncCoordinator(
    private val desiredMailboxes: Flow<WorkoutMailbox>,
    private val applyMailbox: suspend (WorkoutMailbox) -> Boolean,
    private val readPeerMailbox: suspend () -> String?,
    private val publishMailbox: suspend (WorkoutMailbox) -> Unit,
    private val logWarning: (String, Throwable) -> Unit,
) {
    private val started = AtomicBoolean(false)
    private val publishSignals = Channel<Unit>(Channel.CONFLATED)

    fun start(scope: CoroutineScope): Job? {
        if (!started.compareAndSet(false, true)) return null
        return scope.launch {
            recoverPeerMailbox()
            coroutineScope {
                launch {
                    desiredMailboxes.distinctUntilChanged().collect {
                        publishSignals.trySend(Unit)
                    }
                }
                for (signal in publishSignals) {
                    publishDesiredMailbox()
                }
            }
        }
    }

    suspend fun applyPeerPayload(payload: String): Boolean =
        applyPeerPayload(payload, requestPublish = true)

    fun requestPublish() {
        publishSignals.trySend(Unit)
    }

    private suspend fun recoverPeerMailbox() {
        val payload = try {
            readPeerMailbox()
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not read phone workout mailbox", error)
            null
        }
        if (payload != null) applyPeerPayload(payload, requestPublish = false)
    }

    private suspend fun applyPeerPayload(payload: String, requestPublish: Boolean): Boolean {
        val mailbox = decodeWorkoutMailboxPayload(payload) ?: return false
        val accepted = try {
            applyMailbox(mailbox)
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not apply phone workout mailbox", error)
            false
        }
        if (accepted && requestPublish) this.requestPublish()
        return accepted
    }

    private suspend fun publishDesiredMailbox() {
        val mailbox = try {
            desiredMailboxes.first()
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not load watch workout mailbox", error)
            return
        }
        try {
            publishMailbox(mailbox)
        } catch (error: Exception) {
            error.rethrowIfCancellation()
            logWarning("Could not publish watch workout mailbox", error)
        }
    }
}

private fun Exception.rethrowIfCancellation() {
    if (this is CancellationException) throw this
}
