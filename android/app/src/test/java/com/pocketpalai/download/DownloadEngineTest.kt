package com.pocketpal.download

import androidx.test.core.app.ApplicationProvider
import com.pocketpal.download.DownloadEngine.Outcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLPeerUnverifiedException

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadEngineTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val server = MockWebServer()
    private val database = inMemoryDatabase(ApplicationProvider.getApplicationContext())
    private val dao = database.downloadDao()
    private val runs = DownloadRuns()
    private var clock = 0L
    private val content = ByteArray(300_000) { (it % 251).toByte() }
    private val destination by lazy { File(tmp.root, "model.gguf") }
    private val part by lazy { File(destination.path + DownloadEngine.PART_SUFFIX) }
    private val requests = mutableListOf<RecordedRequest>()

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
        database.close()
    }

    private fun engine(
        client: OkHttpClient = DownloadEngine.sharedClient,
        openPart: ((File, Boolean) -> java.io.OutputStream)? = null,
    ) = if (openPart == null) {
        DownloadEngine(dao, runs, client, now = { clock }, sleep = { clock += it })
    } else {
        DownloadEngine(dao, runs, client, now = { clock }, sleep = { clock += it }, openPart = openPart)
    }

    private fun insert(
        id: String = ID,
        status: DownloadStatus = DownloadStatus.QUEUED,
        totalBytes: Long = 0,
        etag: String? = null,
        createdAt: Long = 1,
        stalledRuns: Int = 0,
    ) = runBlocking {
        dao.insertDownload(
            downloadRow(
                id, destination.path, status, url = server.url("/model.gguf").toString(),
                totalBytes = totalBytes, createdAt = createdAt, etag = etag, stalledRuns = stalledRuns,
            )
        )
    }

    private fun row(id: String = ID) = runBlocking { dao.getDownload(id)!! }

    private fun run(engine: DownloadEngine = engine(), interval: Long = 1_000): Outcome = runBlocking {
        engine.run(ID, runs.register(ID), interval)
    }

    private fun serve(vararg steps: (RecordedRequest) -> MockResponse) {
        val queue = ArrayDeque(steps.toList())
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = synchronized(queue) {
                requests += request
                (if (queue.size > 1) queue.removeFirst() else queue.first())(request)
            }
        }
    }

    private fun honest(etag: String? = E1, body: ByteArray = content): (RecordedRequest) -> MockResponse = { request ->
        val from = request.getHeader("Range")?.removePrefix("bytes=")?.removeSuffix("-")?.toInt()
        val response = if (from == null) {
            MockResponse().setBody(Buffer().write(body))
        } else {
            partial(from, body)
        }
        etag?.let { response.setHeader("ETag", it) }
        response
    }

    private fun partial(from: Int, body: ByteArray = content, total: Int = body.size) = MockResponse()
        .setResponseCode(206)
        .setHeader("Content-Range", "bytes $from-${body.size - 1}/$total")
        .setBody(Buffer().write(body.copyOfRange(from, body.size)))

    private fun writePart(bytes: Int) = part.writeBytes(content.copyOfRange(0, bytes))

    private fun awaitPartBytes() {
        val deadline = System.currentTimeMillis() + 10_000
        while (!(part.exists() && part.length() > 0)) {
            check(System.currentTimeMillis() < deadline) { "no bytes written" }
            Thread.sleep(20)
        }
    }

    private fun throttled(periodMs: Long = 30_000) = MockResponse()
        .setBody(Buffer().write(content))
        .setHeader("ETag", E1)
        .throttleBody(16 * 1024, periodMs, TimeUnit.MILLISECONDS)

    private fun assertCompleted() {
        assertEquals(DownloadStatus.COMPLETED, row().status)
        assertArrayEquals(content, destination.readBytes())
        assertFalse(part.exists())
    }

    @Test
    fun droppedBodyResumesWithRange() {
        insert()
        serve({ honest()(it).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY) }, honest())

        assertEquals(Outcome.DONE, run())

        assertCompleted()
        val resumed = requests.last().getHeader("Range")!!
        assertTrue(resumed, resumed.matches(Regex("bytes=[1-9]\\d*-")))
        assertEquals(E1, requests.last().getHeader("If-Range"))
        assertEquals(E1, row().etag)
        assertEquals(content.size.toLong(), row().totalBytes)
    }

    @Test
    fun changedEtagOnResumeRestartsFromZero() {
        val changed = content.reversedArray()
        insert(totalBytes = content.size.toLong(), etag = E1)
        writePart(100)
        serve(honest(etag = E2, body = changed))

        run()

        assertEquals(2, requests.size)
        assertNull(requests[1].getHeader("Range"))
        assertArrayEquals(changed, destination.readBytes())
        assertEquals(E2, row().etag)
    }

    @Test
    fun fullResponseOnResumeTruncatesAndRewrites() {
        insert(totalBytes = content.size.toLong(), etag = E1)
        part.writeBytes(ByteArray(100) { 7 })
        serve({ MockResponse().setBody(Buffer().write(content)).setHeader("ETag", E2) })

        run()

        assertEquals(1, requests.size)
        assertCompleted()
        assertEquals(E2, row().etag)
        assertEquals(content.size.toLong(), row().totalBytes)
    }

    @Test
    fun secondValidatorMismatchInOneRunFails() {
        insert(totalBytes = content.size.toLong(), etag = E1)
        writePart(100)
        serve(
            { partial(100).setHeader("ETag", E2) },
            { honest(etag = E2)(it).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY) },
            { partial(it.getHeader("Range")!!.removePrefix("bytes=").removeSuffix("-").toInt()).setHeader("ETag", E3) },
        )

        assertEquals(Outcome.DONE, run())

        assertEquals(DownloadStatus.FAILED, row().status)
        assertEquals(DownloadEngine.REMOTE_CHANGED_ERROR, row().error)
        assertEquals(0L, row().downloadedBytes)
        assertFalse(part.exists())
        assertFalse(destination.exists())
    }

    @Test
    fun contentRangeTotalMismatchIsNeverAppended() {
        insert(totalBytes = content.size.toLong())
        part.writeBytes(ByteArray(100) { 7 })
        serve({ partial(100, total = content.size + 5) }, honest())

        run()

        assertNull(requests[1].getHeader("Range"))
        assertCompleted()
    }

    @Test
    fun contentRangeStartMismatchIsNeverAppended() {
        insert(totalBytes = content.size.toLong())
        part.writeBytes(ByteArray(100) { 7 })
        serve({ partial(50) }, honest())

        run()

        assertNull(requests[1].getHeader("Range"))
        assertCompleted()
    }

    @Test
    fun shortBodyAtCleanEofFailsAndDeletesPart() {
        insert(totalBytes = content.size.toLong())
        writePart(100)
        serve({
            MockResponse()
                .setResponseCode(206)
                .setHeader("Content-Range", "bytes 100-${content.size - 1}/${content.size}")
                .setChunkedBody(Buffer().write(content.copyOfRange(100, content.size - 10)), 4096)
        })

        run()

        assertEquals(DownloadStatus.FAILED, row().status)
        assertEquals(DownloadEngine.SIZE_MISMATCH_ERROR, row().error)
        assertEquals(0L, row().downloadedBytes)
        assertFalse(part.exists())
        assertFalse(destination.exists())
    }

    @Test
    fun fiveZeroByteRunsFail() {
        insert()
        serve({ MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) })

        val outcomes = (1..5).map { run() }

        assertEquals(List(4) { Outcome.RESCHEDULE } + Outcome.DONE, outcomes)
        assertEquals(DownloadStatus.FAILED, row().status)
        assertEquals(DownloadEngine.STALLED_ERROR, row().error)
        assertEquals(5, row().stalledRuns)
        assertTrue(row().failureUnreported)
    }

    @Test
    fun runThatWroteBytesResetsTheStallCount() {
        insert(stalledRuns = 4)
        serve(
            { honest()(it).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY) },
            { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) },
        )

        assertEquals(Outcome.RESCHEDULE, run())

        assertEquals(DownloadStatus.QUEUED, row().status)
        assertEquals(0, row().stalledRuns)
        assertTrue(part.length() > 0)
    }

    @Test
    fun notFoundFailsAfterOneRequest() {
        insert()
        serve({ MockResponse().setResponseCode(404) })

        assertEquals(Outcome.DONE, run())

        assertEquals(1, requests.size)
        assertEquals(DownloadStatus.FAILED, row().status)
        assertEquals("Client error: 404", row().error)
        assertTrue(row().failureUnreported)
    }

    @Test
    fun retryableStatusCodesResumeWithRange() {
        for (code in listOf(408, 429, 503)) {
            requests.clear()
            destination.delete()
            insert(totalBytes = content.size.toLong(), etag = E1)
            writePart(100)
            serve({ MockResponse().setResponseCode(code) }, honest())

            run()

            assertEquals("bytes=100-", requests[1].getHeader("Range"))
            assertCompleted()
        }
    }

    @Test
    fun partWriteFailureIsPermanentAndKeepsPart() {
        insert(totalBytes = content.size.toLong(), etag = E1)
        writePart(100)
        serve(honest())

        run(engine(openPart = { _, _ -> throw IOException("No space left on device") }))

        assertEquals(DownloadStatus.FAILED, row().status)
        assertTrue(row().error!!.contains("No space left on device"))
        assertEquals(100L, part.length())
        assertEquals(100L, row().downloadedBytes)
        assertEquals(1, requests.size)
    }

    @Test
    fun unverifiedPeerIsPermanent() {
        insert()
        var attempts = 0
        val client = DownloadEngine.sharedClient.newBuilder()
            .addInterceptor(Interceptor {
                attempts++
                throw SSLPeerUnverifiedException("peer not verified")
            })
            .build()

        run(engine(client))

        assertEquals(1, attempts)
        assertEquals(DownloadStatus.FAILED, row().status)
    }

    @Test
    fun unsatisfiableRangeAtFullLengthCommits() {
        insert()
        writePart(content.size)
        serve({ MockResponse().setResponseCode(416).setHeader("Content-Range", "bytes */${content.size}") })

        run()

        assertEquals(1, requests.size)
        assertCompleted()
    }

    @Test
    fun unsatisfiableRangeWithOtherTotalRestarts() {
        insert()
        writePart(100)
        serve({ MockResponse().setResponseCode(416).setHeader("Content-Range", "bytes */${content.size}") }, honest())

        run()

        assertNull(requests[1].getHeader("Range"))
        assertCompleted()
    }

    @Test
    fun inPlacePartialIsAdoptedAndResumed() {
        insert(status = DownloadStatus.RUNNING, totalBytes = content.size.toLong())
        destination.writeBytes(content.copyOfRange(0, 100))
        serve(honest())

        run()

        assertEquals("bytes=100-", requests.single().getHeader("Range"))
        assertNull(requests.single().getHeader("If-Range"))
        assertCompleted()
    }

    @Test
    fun fullLengthInPlaceFileCommitsWithoutARequest() {
        insert(status = DownloadStatus.RUNNING, totalBytes = content.size.toLong())
        destination.writeBytes(content)
        serve(honest())

        assertEquals(Outcome.DONE, run())

        assertEquals(0, requests.size)
        assertCompleted()
        assertEquals(content.size.toLong(), row().downloadedBytes)
    }

    @Test
    fun inPlaceFileOfUnknownSizeIsNeverSplicedIntoANewDownload() {
        insert(status = DownloadStatus.RUNNING)
        destination.writeBytes(ByteArray(100) { 7 })
        serve({ partial(it.getHeader("Range")?.removePrefix("bytes=")?.removeSuffix("-")?.toInt() ?: 0) })

        run()

        assertNull(requests.single().getHeader("Range"))
        assertCompleted()
    }

    @Test
    fun newerCompletedRowSupersedesAdoption() = runBlocking {
        insert(status = DownloadStatus.RUNNING, createdAt = 1)
        insert(id = "newer", status = DownloadStatus.COMPLETED, createdAt = 2)
        destination.writeBytes(content)

        run()

        assertEquals(0, requests.size)
        assertEquals(DownloadStatus.CANCELLED, row().status)
        assertArrayEquals(content, destination.readBytes())
        assertFalse(part.exists())
    }

    @Test
    fun resumeWaitsForTheUnwindingRunsStopWrite() = runBlocking {
        insert()
        serve({ throttled() }, honest())
        val first = async(Dispatchers.Default) { engine().run(ID, runs.register(ID), 1_000) }
        awaitPartBytes()

        dao.casStatus(ID, listOf("RUNNING"), DownloadStatus.PAUSED)
        runs.stop(ID)
        dao.casStatus(ID, listOf("PAUSED"), DownloadStatus.QUEUED)
        val second = async(Dispatchers.Default) { engine().run(ID, runs.register(ID), 1_000) }

        assertEquals(Outcome.DONE, first.await())
        assertEquals(Outcome.DONE, second.await())
        assertTrue(requests.last().getHeader("Range")!!.startsWith("bytes="))
        assertCompleted()
    }

    @Test
    fun pausedRowReceivesNoEngineWrite() = runBlocking {
        insert()
        serve({ throttled(periodMs = 100) })
        val running = async(Dispatchers.Default) { engine().run(ID, runs.register(ID), 0) }
        awaitPartBytes()

        dao.casStatus(ID, listOf("RUNNING"), DownloadStatus.PAUSED)
        val pausedAt = row().downloadedBytes

        withTimeout(10_000) { running.await() }
        assertEquals(DownloadStatus.PAUSED, row().status)
        assertEquals(pausedAt, row().downloadedBytes)
        assertFalse(destination.exists())
        assertTrue(part.exists())
    }

    @Test
    fun systemStopMidBodyRequeuesAndKeepsPart() = runBlocking {
        insert()
        serve({ throttled() })
        val running = async(Dispatchers.Default) { engine().run(ID, runs.register(ID), 1_000) }
        awaitPartBytes()

        runs.stop(ID)

        assertEquals(Outcome.RESCHEDULE, withTimeout(5_000) { running.await() })
        assertEquals(DownloadStatus.QUEUED, row().status)
        assertTrue(part.length() > 0)
    }

    @Test
    fun cancelledCoroutineStopsTheBlockedCallPromptly() = runBlocking {
        insert()
        serve({ throttled() })
        val signal = runs.register(ID)
        val job = launch(Dispatchers.Default) { engine().run(ID, signal, 1_000) }
        awaitPartBytes()

        val started = System.nanoTime()
        job.cancelAndJoin()
        val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)

        assertTrue("took $elapsedMs ms", elapsedMs < 5_000)
        assertTrue(signal.stopped)
        assertFalse(signal.userStop)
        assertEquals(DownloadStatus.QUEUED, row().status)
        assertTrue(part.length() > 0)
        withTimeout(1_000) { runs.withDestinationLock(destination.path) {} }
    }

    @Test
    fun userStopFailsAndAwaitsReporting() = runBlocking {
        insert()
        serve({ throttled() })
        val signal = runs.register(ID)
        val running = async(Dispatchers.Default) { engine().run(ID, signal, 1_000) }
        awaitPartBytes()

        signal.stop(user = true)

        assertEquals(Outcome.DONE, withTimeout(5_000) { running.await() })
        assertEquals(DownloadStatus.FAILED, row().status)
        assertEquals(DownloadEngine.STOPPED_ERROR, row().error)
        assertTrue(row().failureUnreported)
        assertTrue(part.length() > 0)
    }

    @Test
    fun sharedClientWaitsSixtySecondsForData() {
        assertEquals(60_000, DownloadEngine.sharedClient.readTimeoutMillis)
    }

    private companion object {
        const val ID = "download-1"
        const val E1 = "\"etag-1\""
        const val E2 = "\"etag-2\""
        const val E3 = "\"etag-3\""
    }
}
