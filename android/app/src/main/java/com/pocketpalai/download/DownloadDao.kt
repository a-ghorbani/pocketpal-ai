package com.pocketpal.download

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :downloadId")
    suspend fun getDownload(downloadId: String): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDownload(download: DownloadEntity)

    @Update
    suspend fun updateDownload(download: DownloadEntity)

    @Delete
    suspend fun deleteDownload(download: DownloadEntity)

    @Query("UPDATE downloads SET downloadedBytes = :bytes, totalBytes = :totalBytes, status = :status WHERE id = :downloadId")
    suspend fun updateProgress(downloadId: String, bytes: Long, totalBytes: Long, status: DownloadStatus)

    @Query("UPDATE downloads SET status = :status, error = :error WHERE id = :downloadId")
    suspend fun updateStatus(downloadId: String, status: DownloadStatus, error: String? = null)
} 