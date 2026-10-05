package com.pocketpal.download

import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadDaoTest {
    private val database = inMemoryDatabase(ApplicationProvider.getApplicationContext())
    private val dao = database.downloadDao()

    @After
    fun close() = database.close()

    @Test
    fun casFromTheWrongStateChangesNothing() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.PAUSED))

        val changed = dao.casStatus("a", listOf(DownloadStatus.RUNNING.name), DownloadStatus.FAILED, "boom")

        assertEquals(0, changed)
        val row = dao.getDownload("a")!!
        assertEquals(DownloadStatus.PAUSED, row.status)
        assertEquals(null, row.error)
    }

    @Test
    fun casFromAnAcceptedStateWrites() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.QUEUED))

        val changed = dao.casStatus(
            "a",
            listOf(DownloadStatus.QUEUED.name, DownloadStatus.RUNNING.name),
            DownloadStatus.RUNNING,
        )

        assertEquals(1, changed)
        assertEquals(DownloadStatus.RUNNING, dao.getDownload("a")!!.status)
    }

    @Test
    fun runningOnlyWritesSkipOtherStates() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.PAUSED, stalledRuns = 3))

        assertEquals(0, dao.writeProgress("a", 10, 100))
        assertEquals(0, dao.writeValidators("a", "\"e\"", 100, 0))
        assertEquals(0, dao.endTransientRun("a", 4, DownloadStatus.QUEUED))

        val row = dao.getDownload("a")!!
        assertEquals(DownloadStatus.PAUSED, row.status)
        assertEquals(0L, row.downloadedBytes)
        assertEquals(3, row.stalledRuns)
    }

    @Test
    fun aFailedWriteAwaitsReportingUntilMarkedOrRequeued() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.RUNNING))

        dao.casStatus("a", listOf("RUNNING"), DownloadStatus.FAILED, "boom")
        assertEquals(true, dao.getDownload("a")!!.failureUnreported)

        dao.markFailureReported("a")
        assertEquals(false, dao.getDownload("a")!!.failureUnreported)

        dao.casStatus("a", listOf("FAILED"), DownloadStatus.FAILED, "again")
        dao.requeue("a", listOf("FAILED"))
        val row = dao.getDownload("a")!!
        assertEquals(DownloadStatus.QUEUED, row.status)
        assertEquals(false, row.failureUnreported)
    }

    @Test
    fun aStalledFailureAwaitsReportingAndCancelClearsIt() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.RUNNING))

        dao.endTransientRun("a", 5, DownloadStatus.FAILED, "stalled")
        assertEquals(true, dao.getDownload("a")!!.failureUnreported)

        dao.casStatus("a", listOf("FAILED"), DownloadStatus.CANCELLED)
        assertEquals(false, dao.getDownload("a")!!.failureUnreported)
    }

    @Test
    fun progressResetsStalledRuns() = runBlocking {
        dao.insertDownload(downloadRow("a", "/m/a.gguf", DownloadStatus.RUNNING, stalledRuns = 3))

        assertEquals(1, dao.writeProgress("a", 10, 100))

        val row = dao.getDownload("a")!!
        assertEquals(10L, row.downloadedBytes)
        assertEquals(0, row.stalledRuns)
    }
}
