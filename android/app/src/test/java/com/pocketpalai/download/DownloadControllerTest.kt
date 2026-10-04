package com.pocketpal.download

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadControllerTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val database = inMemoryDatabase(ApplicationProvider.getApplicationContext())
    private val dao = database.downloadDao()
    private val runs = DownloadRuns()
    private val destination by lazy { File(tmp.root, "model.gguf").path }
    private val part by lazy { File(destination + DownloadEngine.PART_SUFFIX) }
    private val scheduler = FakeScheduler()
    private var clock = 100L
    private var ids = 0
    private val controller = DownloadController(dao, runs, scheduler, clock = { clock++ }, newId = { "new-${++ids}" })

    @After
    fun close() = database.close()

    inner class FakeScheduler : RunnerScheduler {
        val events = mutableListOf<String>()
        val running = mutableSetOf<String>()
        var partExistedAtCancel: Boolean? = null

        override suspend fun schedule(downloadId: String, totalBytes: Long, progressIntervalMs: Long) {
            events += "schedule:$downloadId"
            running += downloadId
        }

        override suspend fun cancelRunners(downloadId: String) {
            events += "cancel:$downloadId"
            partExistedAtCancel = part.exists()
            running -= downloadId
        }

        override suspend fun hasRunner(downloadId: String) = downloadId in running
    }

    private fun insert(
        id: String,
        status: DownloadStatus,
        createdAt: Long = 1,
        url: String = URL,
        etag: String? = null,
        totalBytes: Long = 0,
        dest: String = destination,
    ) = runBlocking {
        dao.insertDownload(downloadRow(id, dest, status, url = url, createdAt = createdAt, etag = etag, totalBytes = totalBytes))
    }

    private fun row(id: String) = runBlocking { dao.getDownload(id)!! }

    private fun start(url: String = URL) = runBlocking {
        controller.start(DownloadController.StartRequest(url, destination, "token", 0, NetworkType.ANY, 500))
    }

    @Test
    fun startReusesAFailedRowAndKeepsItsPart() {
        insert("failed", DownloadStatus.FAILED, etag = E1, totalBytes = 1_000)
        part.writeText("partial")

        val id = start()

        assertEquals("failed", id)
        assertEquals(DownloadStatus.QUEUED, row(id).status)
        assertEquals(E1, row(id).etag)
        assertEquals("token", row(id).authToken)
        assertTrue(part.exists())
        assertEquals("schedule:failed", scheduler.events.last())
    }

    @Test
    fun startWithAnotherUrlResetsValidatorsAndPart() {
        insert("failed", DownloadStatus.FAILED, etag = E1, totalBytes = 1_000)
        part.writeText("partial")

        val id = start(url = "$URL?revision=2")

        assertEquals("failed", id)
        assertNull(row(id).etag)
        assertEquals(0L, row(id).totalBytes)
        assertEquals("$URL?revision=2", row(id).url)
        assertFalse(part.exists())
    }

    @Test
    fun freshInsertDeletesAStalePart() {
        insert("done", DownloadStatus.COMPLETED)
        part.writeText("stale")

        val id = start()

        assertEquals("new-1", id)
        assertEquals(DownloadStatus.QUEUED, row(id).status)
        assertFalse(part.exists())
    }

    @Test
    fun startRetiresOtherLiveRows() {
        insert("older", DownloadStatus.RUNNING, createdAt = 1)
        insert("newer", DownloadStatus.QUEUED, createdAt = 2)

        val id = start()

        assertEquals("newer", id)
        assertEquals(DownloadStatus.CANCELLED, row("older").status)
        assertTrue("cancel:older" in scheduler.events)
    }

    @Test
    fun cancelStopsRunnersBeforeDeletingThePart() = runBlocking {
        insert("a", DownloadStatus.RUNNING)
        part.writeText("partial")

        controller.cancel("a")

        assertEquals(DownloadStatus.CANCELLED, row("a").status)
        assertEquals(listOf("cancel:a"), scheduler.events)
        assertEquals(true, scheduler.partExistedAtCancel)
        assertFalse(part.exists())
    }

    @Test
    fun cancelOfACompletedRowDoesNothing() = runBlocking {
        insert("a", DownloadStatus.COMPLETED)

        controller.cancel("a")

        assertEquals(DownloadStatus.COMPLETED, row("a").status)
        assertTrue(scheduler.events.isEmpty())
    }

    @Test
    fun pauseKeepsThePartAndResumeSchedulesAtOnce() = runBlocking {
        insert("a", DownloadStatus.RUNNING)
        part.writeText("partial")

        controller.pause("a")
        assertEquals(DownloadStatus.PAUSED, row("a").status)
        assertEquals(listOf("cancel:a"), scheduler.events)
        assertTrue(part.exists())

        controller.resume("a")
        assertEquals(DownloadStatus.QUEUED, row("a").status)
        assertEquals("schedule:a", scheduler.events.last())
    }

    @Test
    fun retrySchedulesTheFailedRow() = runBlocking {
        insert("a", DownloadStatus.FAILED)

        controller.retry("a")

        assertEquals(DownloadStatus.QUEUED, row("a").status)
        assertEquals(listOf("schedule:a"), scheduler.events)
    }

    @Test
    fun activeReturnsOnlyTheNewestLiveRowPerDestination() = runBlocking {
        insert("older", DownloadStatus.RUNNING, createdAt = 1)
        insert("newer", DownloadStatus.QUEUED, createdAt = 2)
        insert("failed", DownloadStatus.FAILED, createdAt = 3)

        val active = controller.active()

        assertEquals(listOf("newer"), active.map { it.id })
        assertEquals(DownloadStatus.CANCELLED, row("older").status)
        assertEquals(DownloadStatus.FAILED, row("failed").status)
    }

    @Test
    fun activeIncludesAReportOnceFailureUntilEmitted() = runBlocking {
        insert("stopped", DownloadStatus.FAILED)
        insert("other", DownloadStatus.FAILED, dest = "$destination-2")
        runs.markReportOnce("stopped")

        assertEquals(listOf("stopped"), controller.active().map { it.id })

        controller.onFailedEmitted("stopped")
        assertTrue(controller.active().isEmpty())
    }

    @Test
    fun reattachSchedulesOnlyTheNewestRowWithoutARunner() = runBlocking {
        insert("older", DownloadStatus.RUNNING, createdAt = 1)
        insert("newer", DownloadStatus.QUEUED, createdAt = 2)

        controller.reattach("older")
        assertEquals(DownloadStatus.CANCELLED, row("older").status)
        assertFalse("schedule:older" in scheduler.events)

        controller.reattach("newer")
        assertEquals("schedule:newer", scheduler.events.last())

        scheduler.events.clear()
        controller.reattach("newer")
        assertTrue(scheduler.events.isEmpty())
    }

    @Test
    fun reattachNeverSchedulesAPausedRow() = runBlocking {
        insert("a", DownloadStatus.PAUSED)

        controller.reattach("a")

        assertTrue(scheduler.events.isEmpty())
    }

    private companion object {
        const val URL = "https://huggingface.co/x/resolve/main/model.gguf"
        const val E1 = "\"etag-1\""
    }
}
