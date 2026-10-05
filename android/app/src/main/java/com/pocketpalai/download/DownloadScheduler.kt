package com.pocketpal.download

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.concurrent.futures.await
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager

interface RunnerScheduler {
    suspend fun schedule(
        downloadId: String,
        totalBytes: Long,
        progressIntervalMs: Long = DownloadWorker.DEFAULT_PROGRESS_INTERVAL,
    )

    suspend fun cancelRunners(downloadId: String)

    suspend fun hasRunner(downloadId: String): Boolean
}

interface UidtPort {
    fun schedule(job: JobInfo): Int
    fun cancel(jobId: Int)
    fun isPending(jobId: Int): Boolean
}

interface WorkPort {
    fun enqueue(downloadId: String, progressIntervalMs: Long)
    suspend fun cancel(downloadId: String)
    suspend fun hasUnfinished(downloadId: String): Boolean
}

class WorkManagerPort(context: Context) : WorkPort {
    private val workManager = WorkManager.getInstance(context)

    override fun enqueue(downloadId: String, progressIntervalMs: Long) {
        workManager.enqueueUniqueWork(
            DownloadScheduler.workName(downloadId),
            ExistingWorkPolicy.REPLACE,
            DownloadWorker.createWorkRequest(downloadId, progressIntervalMs),
        )
    }

    override suspend fun cancel(downloadId: String) {
        workManager.cancelUniqueWork(DownloadScheduler.workName(downloadId)).result.await()
    }

    override suspend fun hasUnfinished(downloadId: String): Boolean =
        workManager.getWorkInfosForUniqueWork(DownloadScheduler.workName(downloadId)).await()
            .any { !it.state.isFinished }
}

@RequiresApi(34)
class JobSchedulerUidt(private val context: Context) : UidtPort {
    private val jobs: JobScheduler by lazy {
        context.getSystemService(JobScheduler::class.java).forNamespace(NAMESPACE)
    }

    override fun schedule(job: JobInfo): Int = jobs.schedule(job)

    override fun cancel(jobId: Int) = jobs.cancel(jobId)

    override fun isPending(jobId: Int): Boolean = jobs.getPendingJob(jobId) != null

    companion object {
        const val NAMESPACE = "downloads"
    }
}

class DownloadScheduler(
    private val context: Context,
    private val runs: DownloadRuns,
    private val uidt: UidtPort = JobSchedulerUidt(context),
    private val work: WorkPort = WorkManagerPort(context),
) : RunnerScheduler {

    override suspend fun schedule(downloadId: String, totalBytes: Long, progressIntervalMs: Long) {
        cancelRunners(downloadId)
        if (Build.VERSION.SDK_INT >= 34 && scheduleUserInitiated(downloadId, totalBytes, progressIntervalMs)) {
            return
        }
        Log.d(TAG, "Scheduling WorkManager run for $downloadId")
        work.enqueue(downloadId, progressIntervalMs)
    }

    override suspend fun cancelRunners(downloadId: String) {
        try {
            work.cancel(downloadId)
        } catch (e: Exception) {
            Log.e(TAG, "Error waiting for work cancellation of $downloadId", e)
        }
        if (Build.VERSION.SDK_INT >= 34) uidt.cancel(jobId(downloadId))
        runs.stop(downloadId)
    }

    override suspend fun hasRunner(downloadId: String): Boolean =
        runs.isActive(downloadId) ||
            (Build.VERSION.SDK_INT >= 34 && uidt.isPending(jobId(downloadId))) ||
            work.hasUnfinished(downloadId)

    @RequiresApi(34)
    private fun scheduleUserInitiated(downloadId: String, totalBytes: Long, progressIntervalMs: Long): Boolean {
        val job = JobInfo.Builder(jobId(downloadId), ComponentName(context, DownloadJobService::class.java))
            .setUserInitiated(true)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(UIDT_BACKOFF_MS, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .setExtras(
                PersistableBundle().apply {
                    putString(DownloadJobService.KEY_DOWNLOAD_ID, downloadId)
                    putLong(DownloadJobService.KEY_PROGRESS_INTERVAL, progressIntervalMs)
                }
            )
            .apply { if (totalBytes > 0) setEstimatedNetworkBytes(totalBytes, JobInfo.NETWORK_BYTES_UNKNOWN.toLong()) }
            .build()
        val result = try {
            uidt.schedule(job)
        } catch (e: Exception) {
            Log.w(TAG, "User-initiated job refused for $downloadId", e)
            return false
        }
        Log.d(TAG, "User-initiated job for $downloadId: result $result")
        return result == JobScheduler.RESULT_SUCCESS
    }

    companion object {
        private const val TAG = "DownloadScheduler"
        private const val UIDT_BACKOFF_MS = 30_000L
        fun workName(downloadId: String) = "download_$downloadId"
        fun jobId(downloadId: String) = downloadId.hashCode()
    }
}
