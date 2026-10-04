package com.pocketpal.download

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadSchedulerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val runs = DownloadRuns()
    private val work = FakeWork()

    private class FakeUidt(private val answer: () -> Int) : UidtPort {
        val scheduled = mutableListOf<JobInfo>()
        val cancelled = mutableListOf<Int>()
        private val pending = mutableSetOf<Int>()

        override fun schedule(job: JobInfo): Int {
            scheduled += job
            return answer().also { if (it == JobScheduler.RESULT_SUCCESS) pending += job.id }
        }

        override fun cancel(jobId: Int) {
            cancelled += jobId
            pending -= jobId
        }

        override fun isPending(jobId: Int) = jobId in pending
    }

    private class FakeWork : WorkPort {
        val enqueued = mutableListOf<Pair<String, Long>>()
        val cancelled = mutableListOf<String>()
        private val unfinished = mutableSetOf<String>()

        override fun enqueue(downloadId: String, progressIntervalMs: Long) {
            enqueued += downloadId to progressIntervalMs
            unfinished += downloadId
        }

        override suspend fun cancel(downloadId: String) {
            cancelled += downloadId
            unfinished -= downloadId
        }

        override suspend fun hasUnfinished(downloadId: String) = downloadId in unfinished
    }

    private fun scheduler(uidt: UidtPort) = DownloadScheduler(context, runs, uidt, work)

    @Test
    fun acceptedUserInitiatedJobSkipsWorkManager() = runBlocking {
        val uidt = FakeUidt { JobScheduler.RESULT_SUCCESS }

        scheduler(uidt).schedule(ID, 1_000, 250)

        val job = uidt.scheduled.single()
        assertTrue(job.isUserInitiated)
        assertEquals(ID.hashCode(), job.id)
        assertEquals(JobInfo.NETWORK_TYPE_ANY, job.networkType)
        assertEquals(ID, job.extras.getString(DownloadJobService.KEY_DOWNLOAD_ID))
        assertEquals(250L, job.extras.getLong(DownloadJobService.KEY_PROGRESS_INTERVAL))
        assertEquals(1_000L, job.estimatedNetworkDownloadBytes)
        assertTrue(work.enqueued.isEmpty())
    }

    @Test
    fun refusedUserInitiatedJobFallsBackToWorkManager() = runBlocking {
        scheduler(FakeUidt { JobScheduler.RESULT_FAILURE }).schedule(ID, 0, 250)

        assertEquals(listOf(ID to 250L), work.enqueued)
    }

    @Test
    fun throwingUserInitiatedScheduleFallsBackToWorkManager() = runBlocking {
        scheduler(FakeUidt { throw IllegalStateException("app not visible") }).schedule(ID, 0)

        assertEquals(listOf(ID to DownloadWorker.DEFAULT_PROGRESS_INTERVAL), work.enqueued)
    }

    @Test
    @Config(sdk = [33])
    fun olderAndroidUsesWorkManagerOnly() = runBlocking {
        val uidt = FakeUidt { JobScheduler.RESULT_SUCCESS }
        val scheduler = scheduler(uidt)

        scheduler.schedule(ID, 0)
        assertTrue(scheduler.hasRunner(ID))
        scheduler.cancelRunners(ID)

        assertTrue(uidt.scheduled.isEmpty())
        assertTrue(uidt.cancelled.isEmpty())
        assertEquals(1, work.enqueued.size)
    }

    @Test
    fun cancelRunnersCancelsBothKindsAndTheEngine() = runBlocking {
        val uidt = FakeUidt { JobScheduler.RESULT_SUCCESS }
        val scheduler = scheduler(uidt)
        val signal = runs.register(ID)

        scheduler.cancelRunners(ID)

        assertEquals(listOf(ID.hashCode()), uidt.cancelled)
        assertEquals(listOf(ID), work.cancelled)
        assertTrue(signal.stopped)
    }

    @Test
    fun scheduleCancelsExistingRunnersFirst() = runBlocking {
        val uidt = FakeUidt { JobScheduler.RESULT_SUCCESS }
        val signal = runs.register(ID)

        scheduler(uidt).schedule(ID, 0)

        assertTrue(signal.stopped)
        assertEquals(listOf(ID), work.cancelled)
    }

    @Test
    fun pendingUserInitiatedJobCountsAsARunner() = runBlocking {
        val scheduler = scheduler(FakeUidt { JobScheduler.RESULT_SUCCESS })
        assertFalse(scheduler.hasRunner(ID))

        scheduler.schedule(ID, 0)

        assertTrue(scheduler.hasRunner(ID))
    }

    private companion object {
        const val ID = "download-1"
    }
}
