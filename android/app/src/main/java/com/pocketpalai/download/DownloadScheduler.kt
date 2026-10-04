package com.pocketpal.download

import android.content.Context
import android.util.Log
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

class DownloadScheduler(
    context: Context,
    private val runs: DownloadRuns,
) : RunnerScheduler {
    private val workManager = WorkManager.getInstance(context)

    override suspend fun schedule(downloadId: String, totalBytes: Long, progressIntervalMs: Long) {
        cancelRunners(downloadId)
        Log.d(TAG, "Scheduling WorkManager run for $downloadId")
        workManager.enqueueUniqueWork(
            workName(downloadId),
            ExistingWorkPolicy.REPLACE,
            DownloadWorker.createWorkRequest(downloadId, progressIntervalMs),
        )
    }

    override suspend fun cancelRunners(downloadId: String) {
        try {
            workManager.cancelUniqueWork(workName(downloadId)).result.await()
        } catch (e: Exception) {
            Log.e(TAG, "Error waiting for work cancellation of $downloadId", e)
        }
        runs.stop(downloadId)
    }

    override suspend fun hasRunner(downloadId: String): Boolean =
        runs.isActive(downloadId) ||
            workManager.getWorkInfosForUniqueWork(workName(downloadId)).await().any { !it.state.isFinished }

    companion object {
        private const val TAG = "DownloadScheduler"
        fun workName(downloadId: String) = "download_$downloadId"
    }
}
