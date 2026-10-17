package com.pocketpal.download

import android.app.job.JobParameters
import android.app.job.JobService
import android.util.Log
import androidx.annotation.RequiresApi
import com.pocketpal.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.ConcurrentHashMap

@RequiresApi(34)
class DownloadJobService : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val running = ConcurrentHashMap<Int, Running>()

    private class Running(val signal: StopSignal) {
        var job: Job? = null
    }

    enum class StopKind { APP, USER, SYSTEM }

    override fun onStartJob(params: JobParameters): Boolean {
        val downloadId = params.extras.getString(KEY_DOWNLOAD_ID) ?: return false
        val progressInterval = params.extras.getLong(KEY_PROGRESS_INTERVAL, DownloadWorker.DEFAULT_PROGRESS_INTERVAL)
        val notifications = DownloadNotifications(this)
        val notificationId = downloadId.hashCode()
        var posted: Pair<String, Int?>? = null
        fun post(title: String, downloaded: Long, total: Long) {
            val shown = title to DownloadNotifications.percent(downloaded, total)
            if (shown == posted) return
            posted = shown
            setNotification(
                params,
                notificationId,
                notifications.progress(shown.first, shown.second),
                JOB_END_NOTIFICATION_POLICY_REMOVE,
            )
        }
        post(getString(R.string.download_channel_name), 0, 0)

        val entry = Running(DownloadRuns.process.register(downloadId))
        running[params.jobId] = entry
        Log.d(TAG, "Starting user-initiated job ${params.jobId} for $downloadId")
        entry.job = scope.launch {
            var reschedule = false
            try {
                val row = DownloadDatabase.getInstance(applicationContext).downloadDao().getDownload(downloadId)
                if (row != null) {
                    val title = File(row.destination).name
                    post(title, row.downloadedBytes, row.totalBytes)
                    val outcome = DownloadEngine.get(applicationContext)
                        .run(downloadId, entry.signal, progressInterval) { done, total -> post(title, done, total) }
                    reschedule = outcome == DownloadEngine.Outcome.RESCHEDULE
                }
            } finally {
                DownloadRuns.process.unregister(downloadId, entry.signal)
                if (running.remove(params.jobId, entry)) jobFinished(params, reschedule)
            }
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val kind = stopKind(params.stopReason)
        Log.d(TAG, "Job ${params.jobId} stopped: $kind (reason ${params.stopReason})")
        running.remove(params.jobId)?.let {
            it.signal.stop(user = kind == StopKind.USER)
            it.job?.cancel()
        }
        return reschedules(kind)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "DownloadJobService"
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_PROGRESS_INTERVAL = "progress_interval"

        fun stopKind(reason: Int): StopKind = when (reason) {
            JobParameters.STOP_REASON_CANCELLED_BY_APP -> StopKind.APP
            JobParameters.STOP_REASON_USER -> StopKind.USER
            else -> StopKind.SYSTEM
        }

        fun reschedules(kind: StopKind): Boolean = kind == StopKind.SYSTEM
    }
}
