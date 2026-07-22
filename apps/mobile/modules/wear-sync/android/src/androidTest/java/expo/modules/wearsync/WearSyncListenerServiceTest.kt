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

    val path = "/workout/native-bridge-${System.nanoTime()}"
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
  fun workoutPrefixWithoutBoundaryIsIgnored() {
    val payload = """{"id":"native-bridge-workout","exercises":[]}"""
    val received = mutableListOf<String>()
    WearSyncBridge.attach { received.add(it) }

    val request = PutDataMapRequest.create("/workoutfoo").apply {
      dataMap.putString("payload", payload)
    }.asPutDataRequest().setUrgent()

    WearSyncListenerService.deliverDataItem(
      FakeDataItem(
        uri = Uri.parse("wear://self/workoutfoo"),
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
  fun acknowledgeWorkoutBuildsPersistentUrgentDataItem() {
    val timestamp = 1_725_000_000_000L

    val request = WearSyncModule.buildWorkoutAckRequest("workout-123", timestamp)
    val dataMap = DataMap.fromByteArray(checkNotNull(request.data))

    assertEquals("/workout-ack/workout-123", request.uri.path)
    assertTrue("expected acknowledgement request to be urgent", request.isUrgent)
    assertEquals("workout-123", dataMap.getString("workout_id"))
    assertEquals(timestamp, dataMap.getLong("timestamp"))
  }

  @Test
  fun acknowledgeWorkoutRejectsBlankId() {
    assertThrows(IllegalArgumentException::class.java) {
      WearSyncModule.buildWorkoutAckRequest("   ")
    }
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
