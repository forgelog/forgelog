package expo.modules.wearsync

import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataItemAsset
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.PutDataMapRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class WearSyncListenerServiceTest {
  @Before
  fun setUp() {
    WearSyncBridge.resetForTests()
  }

  @After
  fun tearDown() {
    WearSyncBridge.resetForTests()
  }

  @Test
  fun workoutDataItemDeliversPayloadToBridge() {
    val payload = """{"id":"native-bridge-workout","exercises":[]}"""
    val received = mutableListOf<String>()
    val delivered = CountDownLatch(1)
    WearSyncBridge.attach {
      received.add(it)
      delivered.countDown()
    }

    val path = "/workout-mailbox/watch"
    val request = PutDataMapRequest.create(path).apply {
      dataMap.putString("payload", payload)
    }.asPutDataRequest().setUrgent()

    WearSyncListenerService.deliverDataItem(
      FakeDataItem(
        uri = Uri.parse("wear://self$path"),
        data = checkNotNull(request.data),
      ),
    )

    assertTrue("expected $path to deliver through WearSyncBridge", delivered.await(10, TimeUnit.SECONDS))
    assertEquals(listOf(payload), received)
  }

  @Test
  fun requestSyncMessageSetsSyncRequestFlag() {
    val delivered = CountDownLatch(1)
    WearSyncBridge.attachSyncRequestListener {
      delivered.countDown()
    }

    WearSyncListenerService.deliverMessage("/request-sync")

    assertTrue("expected /request-sync to deliver through WearSyncBridge", delivered.await(10, TimeUnit.SECONDS))
  }

  @Test
  fun nonExactMailboxPathIsIgnored() {
    val payload = """{"id":"native-bridge-workout","exercises":[]}"""
    val received = mutableListOf<String>()
    WearSyncBridge.attach { received.add(it) }

    val request = PutDataMapRequest.create("/workout-mailbox/watch/extra").apply {
      dataMap.putString("payload", payload)
    }.asPutDataRequest().setUrgent()

    WearSyncListenerService.deliverDataItem(
      FakeDataItem(
        uri = Uri.parse("wear://self/workout-mailbox/watch/extra"),
        data = checkNotNull(request.data),
      ),
    )

    assertEquals(emptyList<String>(), received)
  }

  @Test
  fun publishSnapshotBuildsDataLayerRequest() {
    val payload = """{"routines":[],"personalRecords":[]}"""
    val timestamp = 1_725_000_000_000L

    val request = WearSyncModule.buildSnapshotRequest(payload, timestamp)
    val dataMap = DataMap.fromByteArray(checkNotNull(request.data))

    assertEquals("/sync-snapshot", request.uri.path)
    assertTrue("expected snapshot request to be urgent", request.isUrgent)
    assertEquals(payload, dataMap.getString("payload"))
    assertEquals(timestamp, dataMap.getLong("timestamp"))
  }

  @Test
  fun workoutMailboxBuildsPersistentUrgentDataItemWithoutNonce() {
    val payload = """{"protocol_version":1,"candidate":null,"watch_receipt":null}"""
    val request = WearSyncModule.buildWorkoutMailboxRequest(payload)
    val dataMap = DataMap.fromByteArray(checkNotNull(request.data))

    assertEquals("/workout-mailbox/phone", request.uri.path)
    assertTrue("expected mailbox request to be urgent", request.isUrgent)
    assertEquals(payload, dataMap.getString("payload"))
    assertEquals(false, dataMap.containsKey("timestamp"))
  }

  private class FakeDataItem(
    private val uri: Uri,
    private var data: ByteArray,
  ) : DataItem {
    override fun getUri(): Uri = uri

    override fun setData(data: ByteArray?): DataItem {
      this.data = checkNotNull(data)
      return this
    }

    override fun getAssets(): Map<String, DataItemAsset> = emptyMap()

    override fun getData(): ByteArray = data

    override fun freeze(): DataItem = this

    override fun isDataValid(): Boolean = true
  }
}
