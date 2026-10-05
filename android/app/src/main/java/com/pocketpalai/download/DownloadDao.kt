package com.pocketpal.download

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :downloadId")
    suspend fun getDownload(downloadId: String): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE id = :downloadId")
    fun observe(downloadId: String): Flow<DownloadEntity?>

    @Query("SELECT * FROM downloads WHERE destination = :destination ORDER BY createdAt DESC")
    suspend fun byDestination(destination: String): List<DownloadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDownload(download: DownloadEntity)

    @Update
    suspend fun updateDownload(download: DownloadEntity)

    @Delete
    suspend fun deleteDownload(download: DownloadEntity)

    @Query("UPDATE downloads SET status = :to, error = :error, failureUnreported = (:to = 'FAILED') WHERE id = :downloadId AND status IN (:from)")
    suspend fun casStatus(downloadId: String, from: List<String>, to: DownloadStatus, error: String? = null): Int

    @Query("UPDATE downloads SET status = 'QUEUED', stalledRuns = 0, error = NULL, failureUnreported = 0 WHERE id = :downloadId AND status IN (:from)")
    suspend fun requeue(downloadId: String, from: List<String>): Int

    @Query("UPDATE downloads SET failureUnreported = 0 WHERE id = :downloadId")
    suspend fun markFailureReported(downloadId: String)

    @Query("UPDATE downloads SET authToken = :authToken WHERE id = :downloadId")
    suspend fun setAuthToken(downloadId: String, authToken: String?)

    @Query("UPDATE downloads SET url = :url, etag = NULL, totalBytes = 0, downloadedBytes = 0 WHERE id = :downloadId")
    suspend fun resetResource(downloadId: String, url: String)

    @Query("UPDATE downloads SET downloadedBytes = :bytes, totalBytes = :totalBytes, stalledRuns = 0 WHERE id = :downloadId AND status = 'RUNNING'")
    suspend fun writeProgress(downloadId: String, bytes: Long, totalBytes: Long): Int

    @Query("UPDATE downloads SET etag = :etag, totalBytes = :totalBytes, downloadedBytes = :downloadedBytes WHERE id = :downloadId AND status = 'RUNNING'")
    suspend fun writeValidators(downloadId: String, etag: String?, totalBytes: Long, downloadedBytes: Long): Int

    @Query("UPDATE downloads SET status = 'FAILED', error = :error, downloadedBytes = :downloadedBytes, failureUnreported = 1 WHERE id = :downloadId AND status = 'RUNNING'")
    suspend fun fail(downloadId: String, error: String, downloadedBytes: Long): Int

    @Query("UPDATE downloads SET stalledRuns = :stalledRuns, status = :to, error = :error, failureUnreported = (:to = 'FAILED') WHERE id = :downloadId AND status = 'RUNNING'")
    suspend fun endTransientRun(downloadId: String, stalledRuns: Int, to: DownloadStatus, error: String? = null): Int
}
