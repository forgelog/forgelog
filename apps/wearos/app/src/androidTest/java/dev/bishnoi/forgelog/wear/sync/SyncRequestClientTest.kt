package dev.bishnoi.forgelog.wear.sync

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A single test-runner emulator has no connected phone node, so this
 * exercises the "no reachable phone" path — the one guaranteed to be
 * reachable in this environment (see WearDataClientTest for why a real
 * Bluetooth pairing isn't available here). Confirms requestSync degrades to
 * a no-op instead of throwing, matching publishSyncSnapshot()'s "no reachable
 * watch" handling on the phone side.
 */
@RunWith(AndroidJUnit4::class)
class SyncRequestClientTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun requestSyncWithNoConnectedPhoneReturnsFalseWithoutThrowing() {
        val result = runBlocking { SyncRequestClient.requestSync(context) }
        assertFalse(result)
    }
}
