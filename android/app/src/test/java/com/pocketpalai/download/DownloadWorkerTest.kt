package com.pocketpal.download

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadWorkerTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val server = MockWebServer()
    private val database = inMemoryDatabase(context)
    private val dao = database.downloadDao()
    private val runs = DownloadRuns()
    private var clock = 0L
    private val engine = DownloadEngine(dao, runs, now = { clock }, sleep = { clock += it })
    private val content = ByteArray(200_000) { (it % 251).toByte() }
    private val destination by lazy { File(tmp.root, "model.gguf") }
    private val part by lazy { File(destination.path + DownloadEngine.PART_SUFFIX) }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
        database.close()
    }

    private fun worker(): DownloadWorker {
        runBlocking {
            dao.insertDownload(downloadRow(ID, destination.path, url = server.url("/model.gguf").toString()))
        }
        return TestListenableWorkerBuilder<DownloadWorker>(context)
            .setInputData(workDataOf(DownloadWorker.KEY_DOWNLOAD_ID to ID))
            .setWorkerFactory(object : WorkerFactory() {
                override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters) =
                    DownloadWorker(appContext, workerParameters, engine, runs)
            })
            .build()
    }

    private fun row() = runBlocking { dao.getDownload(ID)!! }

    @Test
    fun transientGiveUpAsksForRetry() = runBlocking {
        repeat(20) { server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)) }

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.retry(), result)
        assertEquals(DownloadStatus.QUEUED, row().status)
        assertFalse(runs.isActive(ID))
    }

    @Test
    fun completedRunSucceeds() = runBlocking {
        server.enqueue(MockResponse().setBody(Buffer().write(content)))

        val result = worker().doWork()

        assertEquals(ListenableWorker.Result.success(), result)
        assertEquals(DownloadStatus.COMPLETED, row().status)
    }

    @Test
    fun cancellingTheWorkStopsTheBlockedCallPromptly() = runBlocking {
        server.enqueue(MockResponse().setBody(Buffer().write(content)).throttleBody(16 * 1024, 30, TimeUnit.SECONDS))
        val worker = worker()
        val job = launch(Dispatchers.Default) { worker.doWork() }
        val deadline = System.currentTimeMillis() + 10_000
        while (!(part.exists() && part.length() > 0)) {
            check(System.currentTimeMillis() < deadline)
            Thread.sleep(20)
        }

        val started = System.nanoTime()
        job.cancelAndJoin()
        val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)

        assertTrue("took $elapsedMs ms", elapsedMs < 5_000)
        assertEquals(DownloadStatus.QUEUED, row().status)
        assertTrue(part.length() > 0)
        assertFalse(runs.isActive(ID))
    }

    private companion object {
        const val ID = "download-1"
    }
}
