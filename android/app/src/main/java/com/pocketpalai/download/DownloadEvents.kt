package com.pocketpal.download

sealed interface RowEvent {
    data class Progress(val bytesWritten: Long, val totalBytes: Long) : RowEvent
    data class Completed(val filePath: String) : RowEvent
    data class Failed(val error: String, val progress: Double) : RowEvent
}

fun percent(downloadedBytes: Long, totalBytes: Long): Double =
    if (totalBytes > 0) downloadedBytes.toDouble() / totalBytes.toDouble() * 100 else 0.0

fun DownloadEntity.event(): RowEvent? = when (status) {
    DownloadStatus.RUNNING -> RowEvent.Progress(downloadedBytes, totalBytes)
    DownloadStatus.COMPLETED -> RowEvent.Completed(destination)
    DownloadStatus.FAILED -> RowEvent.Failed(error ?: "Unknown error", percent(downloadedBytes, totalBytes))
    DownloadStatus.QUEUED, DownloadStatus.PAUSED, DownloadStatus.CANCELLED -> null
}

val DownloadStatus.endsObservation: Boolean
    get() = this == DownloadStatus.COMPLETED || this == DownloadStatus.FAILED || this == DownloadStatus.CANCELLED
