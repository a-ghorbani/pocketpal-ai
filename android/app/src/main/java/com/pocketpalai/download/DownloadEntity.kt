package com.pocketpal.download

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val id: String,
    val url: String,
    val destination: String,
    val totalBytes: Long,
    val downloadedBytes: Long,
    val status: DownloadStatus,
    val priority: Int,
    val networkType: NetworkType,
    val createdAt: Long,
    val error: String? = null
)

enum class DownloadStatus {
    QUEUED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
}

enum class NetworkType {
    ANY, WIFI
} 