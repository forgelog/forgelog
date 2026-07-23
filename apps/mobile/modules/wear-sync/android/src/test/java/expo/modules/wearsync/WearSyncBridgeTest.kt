package expo.modules.wearsync

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class WearSyncBridgeTest {
  @Before
  fun setUp() {
    WearSyncBridge.resetForTests()
  }

  @After
  fun tearDown() {
    WearSyncBridge.resetForTests()
  }

  @Test
  fun payloadDeliveredBeforeAttachIsQueuedAndDrainedInOrder() {
    WearSyncBridge.deliver("first")
    WearSyncBridge.deliver("second")

    val received = mutableListOf<String>()
    WearSyncBridge.attach { received.add(it) }

    assertEquals(listOf("first", "second"), received)
  }

  @Test
  fun attachedListenerReceivesPayloadsImmediately() {
    val received = mutableListOf<String>()
    WearSyncBridge.attach { received.add(it) }

    WearSyncBridge.deliver("live")

    assertEquals(listOf("live"), received)
  }

  @Test
  fun detachQueuesPayloadsUntilNextAttach() {
    val firstListenerPayloads = mutableListOf<String>()
    val secondListenerPayloads = mutableListOf<String>()

    WearSyncBridge.attach { firstListenerPayloads.add(it) }
    WearSyncBridge.detach()
    WearSyncBridge.deliver("while-detached")
    WearSyncBridge.attach { secondListenerPayloads.add(it) }

    assertEquals(emptyList<String>(), firstListenerPayloads)
    assertEquals(listOf("while-detached"), secondListenerPayloads)
  }

  @Test
  fun syncRequestPendingFlagDedupesRepeatedRequestsBeforeAttach() {
    var requests = 0

    WearSyncBridge.deliverSyncRequest()
    WearSyncBridge.deliverSyncRequest()
    WearSyncBridge.attachSyncRequestListener { requests += 1 }

    assertEquals(1, requests)

    WearSyncBridge.deliverSyncRequest()

    assertEquals(2, requests)
  }

  @Test
  fun syncRequestDeliveredWhileDetachedIsDeliveredOnReattach() {
    var firstListenerRequests = 0
    var secondListenerRequests = 0

    WearSyncBridge.attachSyncRequestListener { firstListenerRequests += 1 }
    WearSyncBridge.detachSyncRequestListener()
    WearSyncBridge.deliverSyncRequest()
    WearSyncBridge.attachSyncRequestListener { secondListenerRequests += 1 }

    assertEquals(0, firstListenerRequests)
    assertEquals(1, secondListenerRequests)
  }

  @Test
  fun activeItemsQueueUntilAttachAndResumeQueuingAfterDetach() {
    val first = WearSyncBridge.ActiveDataItem("/active-workout/mutation/epoch/watch/1", "first")
    val live = WearSyncBridge.ActiveDataItem("/active-workout/state-ack/watch", "live")
    val detached = WearSyncBridge.ActiveDataItem("/workout/checkpoint", "detached")
    val firstListenerItems = mutableListOf<WearSyncBridge.ActiveDataItem>()
    val secondListenerItems = mutableListOf<WearSyncBridge.ActiveDataItem>()

    WearSyncBridge.deliverActive(first.path, first.payload)
    WearSyncBridge.attachActiveListener { firstListenerItems.add(it) }
    WearSyncBridge.deliverActive(live.path, live.payload)
    WearSyncBridge.detachActiveListener()
    WearSyncBridge.deliverActive(detached.path, detached.payload)
    WearSyncBridge.attachActiveListener { secondListenerItems.add(it) }

    assertEquals(listOf(first, live), firstListenerItems)
    assertEquals(listOf(detached), secondListenerItems)
  }

  @Test
  fun concurrentDeliverAndAttachDoesNotLosePayloads() {
    val payloadCount = 200
    val executor = Executors.newFixedThreadPool(8)
    val start = CountDownLatch(1)
    val received = ConcurrentLinkedQueue<String>()
    val tasks = mutableListOf<java.util.concurrent.Future<*>>()

    repeat(payloadCount) { index ->
      tasks += executor.submit {
        assertTrue(start.await(5, TimeUnit.SECONDS))
        WearSyncBridge.deliver("payload-$index")
      }
    }
    tasks += executor.submit {
      assertTrue(start.await(5, TimeUnit.SECONDS))
      WearSyncBridge.attach { received.add(it) }
    }

    start.countDown()
    tasks.forEach { it.get(5, TimeUnit.SECONDS) }
    executor.shutdown()
    assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS))

    val expected = (0 until payloadCount).map { "payload-$it" }.toSet()
    assertEquals(expected, received.toSet())
    assertEquals(payloadCount, received.size)
  }
}
