package com.pocketpal.download

import android.content.Context
import android.util.Log
import androidx.work.*

class DownloadWorker @JvmOverloads constructor(
    context: Context,
    params: WorkerParameters,
    private val engine: DownloadEngine = DownloadEngine.get(context),
    private val runs: DownloadRuns = DownloadRuns.process,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val downloadId = inputData.getString(KEY_DOWNLOAD_ID) ?: return Result.failure()
        val progressInterval = inputData.getLong(KEY_PROGRESS_INTERVAL, DEFAULT_PROGRESS_INTERVAL)
        Log.d(TAG, "Running download $downloadId (attempt $runAttemptCount)")
        val signal = runs.register(downloadId)
        return try {
            when (engine.run(downloadId, signal, progressInterval)) {
                DownloadEngine.Outcome.RESCHEDULE -> Result.retry()
                DownloadEngine.Outcome.DONE -> Result.success()
            }
        } finally {
            runs.unregister(downloadId, signal)
        }
    }

    companion object {
        private const val TAG = "DownloadWorker"
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_PROGRESS_INTERVAL = "progress_interval"
        const val DEFAULT_PROGRESS_INTERVAL = 1000L // 1 second default

        fun createWorkRequest(downloadId: String, progressInterval: Long = DEFAULT_PROGRESS_INTERVAL): OneTimeWorkRequest {
            Log.d(TAG, "Creating work request for download ID: $downloadId with progress interval: $progressInterval ms")
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                .build()

            return OneTimeWorkRequestBuilder<DownloadWorker>()
                .setConstraints(constraints)
                .setInputData(workDataOf(
                    KEY_DOWNLOAD_ID to downloadId,
                    KEY_PROGRESS_INTERVAL to progressInterval
                ))
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    java.util.concurrent.TimeUnit.MILLISECONDS
                )
                .build()
        }
    }
}
