package com.pocketpal.download

import android.util.Log
import kotlinx.coroutines.flow.first
import java.io.File
import java.util.UUID

class DownloadController(
    private val dao: DownloadDao,
    private val runs: DownloadRuns,
    private val scheduler: RunnerScheduler,
    private val clock: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    data class StartRequest(
        val url: String,
        val destination: String,
        val authToken: String?,
        val priority: Int,
        val networkType: NetworkType,
        val progressIntervalMs: Long,
    )

    suspend fun start(request: StartRequest): String {
        val rows = dao.byDestination(request.destination)
        val reusable = rows.firstOrNull { it.status in REUSABLE }
            ?.takeIf { dao.requeue(it.id, REUSABLE_NAMES) == 1 }
        val kept = reusable ?: insert(request)
        val deletePart = reusable == null || reusable.url != request.url
        if (reusable != null) {
            dao.setAuthToken(kept.id, request.authToken)
            if (deletePart) dao.resetResource(kept.id, request.url)
        }
        rows.filter { it.id != kept.id && it.status in LIVE }.forEach { retire(it) }
        if (deletePart) {
            scheduler.cancelRunners(kept.id)
            deletePart(request.destination)
        }
        Log.d(TAG, "Start ${kept.id} for ${request.destination} (reused=${reusable != null})")
        scheduler.schedule(kept.id, if (deletePart) 0 else kept.totalBytes, request.progressIntervalMs)
        return kept.id
    }

    suspend fun pause(downloadId: String) {
        dao.casStatus(downloadId, ACTIVE_NAMES, DownloadStatus.PAUSED)
        scheduler.cancelRunners(downloadId)
    }

    suspend fun resume(downloadId: String) {
        if (dao.requeue(downloadId, listOf(DownloadStatus.PAUSED.name)) == 1) {
            scheduler.schedule(downloadId, dao.getDownload(downloadId)?.totalBytes ?: 0)
        }
    }

    suspend fun retry(downloadId: String) {
        if (dao.requeue(downloadId, listOf(DownloadStatus.FAILED.name)) == 1) {
            scheduler.schedule(downloadId, dao.getDownload(downloadId)?.totalBytes ?: 0)
        }
    }

    suspend fun cancel(downloadId: String) {
        val row = dao.getDownload(downloadId) ?: return
        if (dao.casStatus(downloadId, REUSABLE_NAMES, DownloadStatus.CANCELLED, CANCELLED_ERROR) == 0) return
        scheduler.cancelRunners(downloadId)
        deletePart(row.destination)
    }

    suspend fun active(): List<DownloadEntity> {
        val all = dao.getAllDownloads().first()
        val newest = all.filter { it.status in LIVE }
            .groupBy { it.destination }
            .map { (_, rows) ->
                val sorted = rows.sortedByDescending { it.createdAt }
                sorted.drop(1).forEach { retire(it) }
                sorted.first()
            }
        val reportOnce = runs.reportOnceIds()
        return newest + all.filter { it.id in reportOnce && it.status == DownloadStatus.FAILED }
    }

    suspend fun reattach(downloadId: String): DownloadEntity? {
        val row = dao.getDownload(downloadId) ?: return null
        if (row.status !in ACTIVE) return row
        val newestLive = dao.byDestination(row.destination).first { it.status in LIVE }
        when {
            newestLive.id != row.id -> retire(row)
            !scheduler.hasRunner(row.id) -> scheduler.schedule(row.id, row.totalBytes)
        }
        return row
    }

    fun onFailedEmitted(downloadId: String) = runs.clearReportOnce(downloadId)

    private suspend fun insert(request: StartRequest): DownloadEntity =
        DownloadEntity(
            id = newId(),
            url = request.url,
            destination = request.destination,
            totalBytes = 0,
            downloadedBytes = 0,
            status = DownloadStatus.QUEUED,
            priority = request.priority,
            networkType = request.networkType,
            createdAt = clock(),
            authToken = request.authToken,
        ).also { dao.insertDownload(it) }

    private suspend fun retire(row: DownloadEntity) {
        Log.d(TAG, "Retiring superseded download ${row.id}")
        dao.casStatus(row.id, LIVE_NAMES, DownloadStatus.CANCELLED)
        scheduler.cancelRunners(row.id)
    }

    private suspend fun deletePart(destination: String) {
        runs.withDestinationLock(destination) {
            File(destination + DownloadEngine.PART_SUFFIX).delete()
        }
    }

    companion object {
        private const val TAG = "DownloadController"
        const val CANCELLED_ERROR = "Download cancelled by user"
        private val ACTIVE = setOf(DownloadStatus.QUEUED, DownloadStatus.RUNNING)
        private val LIVE = ACTIVE + DownloadStatus.PAUSED
        private val REUSABLE = LIVE + DownloadStatus.FAILED
        private val ACTIVE_NAMES = ACTIVE.map { it.name }
        private val LIVE_NAMES = LIVE.map { it.name }
        private val REUSABLE_NAMES = REUSABLE.map { it.name }
    }
}
