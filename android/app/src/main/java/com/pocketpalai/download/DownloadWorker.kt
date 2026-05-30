package com.pocketpal.download

import android.content.Context
import android.util.Log
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine

class DownloadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    private val downloadDao = DownloadDatabase.getInstance(context).downloadDao()
    private val client = OkHttpClient.Builder()
        .addInterceptor(ProgressInterceptor())
        .build()
    private var lastProgressUpdate = 0L
    private var currentCall: Call? = null

    init {
        Log.d(TAG, "Initializing DownloadWorker")
    }

    private fun handleStopped() {
        Log.d(TAG, "Worker stopped, cancelling any ongoing network request")
        currentCall?.cancel()
    }

    private fun applyStoredHeaders(
        requestBuilder: Request.Builder,
        requestHeaders: String?
    ): Boolean {
        if (requestHeaders.isNullOrBlank()) {
            return false
        }

        var hasAuthorization = false
        try {
            val json = JSONObject(requestHeaders)
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key)
                if (value.isNotBlank()) {
                    requestBuilder.header(key, value)
                    if (key.equals("Authorization", ignoreCase = true)) {
                        hasAuthorization = true
                    }
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Ignoring invalid stored request headers", error)
        }

        return hasAuthorization
    }

    private suspend fun clearSensitiveHeaders(downloadId: String) {
        downloadDao.clearSensitiveHeaders(downloadId)
    }

    private fun deletePartialFile(file: File, reason: String) {
        if (file.exists()) {
            Log.d(TAG, "Deleting partial download file after $reason: ${file.absolutePath}")
            file.delete()
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val downloadId = inputData.getString(KEY_DOWNLOAD_ID) ?: return@withContext Result.failure()
            Log.d(TAG, "Starting download work for ID: $downloadId")

            if (isStopped) {
                Log.d(TAG, "Work was cancelled before starting for ID: $downloadId")
                handleStopped()
                downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, "Download cancelled")
                clearSensitiveHeaders(downloadId)
                return@withContext Result.failure()
            }

            val progressInterval = inputData.getLong(KEY_PROGRESS_INTERVAL, DEFAULT_PROGRESS_INTERVAL)
            Log.d(TAG, "Progress update interval: $progressInterval ms")

            val download = downloadDao.getDownload(downloadId) ?: return@withContext Result.failure()
            Log.d(
                TAG,
                "Retrieved download info: id=${download.id}, status=${download.status}, progress=${download.downloadedBytes}/${download.totalBytes}"
            )

            if (download.status == DownloadStatus.PAUSED) {
                Log.d(TAG, "Download is paused, returning retry for ID: $downloadId")
                return@withContext Result.retry()
            }

            val file = File(download.destination)
            Log.d(TAG, "Download destination: ${file.absolutePath}")
            
            // Check if file size and database are in sync
            if (file.exists() && file.length() > 0) {
                // If file exists but size doesn't match database, update database
                if (file.length() != download.downloadedBytes) {
                    Log.d(TAG, "File size (${file.length()}) doesn't match database (${download.downloadedBytes}). Updating database.")
                    downloadDao.updateProgress(downloadId, file.length(), download.totalBytes, download.status)
                    // Reload download info after update
                    val updatedDownload = downloadDao.getDownload(downloadId)
                    if (updatedDownload != null) {
                        Log.d(
                            TAG,
                            "Updated download info: id=${updatedDownload.id}, status=${updatedDownload.status}, progress=${updatedDownload.downloadedBytes}/${updatedDownload.totalBytes}"
                        )
                    }
                }
            }
            
            val request = Request.Builder()
                .url(download.url)
                .apply {
                    val hasAuthorizationHeader = applyStoredHeaders(this, download.requestHeaders)

                    if (file.exists() && file.length() > 0) {
                        val range = "bytes=${file.length()}-"
                        Log.d(TAG, "Resuming download from byte ${file.length()}")
                        header("Range", range)
                    }
                    
                    // Add authorization header if token is available
                    download.authToken?.takeIf { !hasAuthorizationHeader }?.let { token ->
                        Log.d(TAG, "Adding Authorization header for authenticated download")
                        header("Authorization", "Bearer $token")
                    }
                }
                .build()

            Log.d(TAG, "Updating status to RUNNING for ID: $downloadId")
            downloadDao.updateStatus(downloadId, DownloadStatus.RUNNING)

            Log.d(TAG, "Executing network request for ID: $downloadId")
            val response = suspendCoroutine { continuation ->
                val call = client.newCall(request)
                currentCall = call  // Store the call reference
                call.enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        if (call.isCanceled()) {
                            Log.d(TAG, "Network request was cancelled for ID: $downloadId")
                        } else {
                            Log.e(TAG, "Network request failed for ID: $downloadId", e)
                        }
                        continuation.resumeWithException(e)
                    }

                    override fun onResponse(call: Call, response: Response) {
                        Log.d(TAG, "Received response for ID: $downloadId, code: ${response.code}")
                        continuation.resume(response)
                    }
                })
            }
            currentCall = null  // Clear the reference after completion

            if (file.exists() && file.length() > 0 && response.code == 200) {
                Log.w(TAG, "Server ignored range request, returning full file. Restarting download from beginning.")
                if (file.exists()) {
                    Log.d(TAG, "Deleting partial file to restart download: ${file.absolutePath}")
                    file.delete()
                }
            } else if (!response.isSuccessful) {
                when (response.code) {
                    416 -> {
                        Log.e(TAG, "Server rejected the range request for ID: $downloadId")
                        
                        deletePartialFile(file, "range rejection")
                        
                        downloadDao.updateStatus(
                            downloadId,
                            DownloadStatus.FAILED,
                            "Download failed: The partial download was invalid or the file on server has changed"
                        )
                        clearSensitiveHeaders(downloadId)
                        
                        return@withContext Result.failure()
                    }
                    in 400..499 -> {
                        val error = "Client error: ${response.code}"
                        Log.e(TAG, error)
                        deletePartialFile(file, "client error")
                        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, error)
                        clearSensitiveHeaders(downloadId)
                        return@withContext Result.failure()
                    }
                    in 500..599 -> {
                        val error = "Server error: ${response.code}"
                        Log.e(TAG, error)
                        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, error)
                        return@withContext Result.retry()
                    }
                    else -> {
                        val error = "Unexpected response: ${response.code}"
                        Log.e(TAG, error)
                        deletePartialFile(file, "unexpected response")
                        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, error)
                        clearSensitiveHeaders(downloadId)
                        return@withContext Result.failure()
                    }
                }
            }

            response.body?.let { body ->
                // Get content length from response
                val contentLength = body.contentLength()
                Log.d(TAG, "Content length from response: $contentLength bytes for ID: $downloadId")
                
                // Get existing bytes written
                var bytesWritten = if (file.exists()) file.length() else 0
                Log.d(TAG, "Existing bytes written: $bytesWritten for ID: $downloadId")
                
                // Calculate total expected size based on response code
                val totalBytes = when (response.code) {
                    206 -> {
                        // For partial content (206), the content-length is just the remaining bytes
                        // So add existing bytes to get total size
                        val total = bytesWritten + contentLength
                        Log.d(TAG, "Partial content (206): Total size = $bytesWritten + $contentLength = $total bytes")
                        total
                    }
                    200 -> {
                        // For full content (200), use the content length as total size
                        Log.d(TAG, "Full content (200): Total size = $contentLength bytes")
                        contentLength
                    }
                    else -> {
                        // For other responses, use the larger of content length or existing total
                        val total = maxOf(contentLength, download.totalBytes)
                        Log.d(TAG, "Other response (${response.code}): Using total size = $total bytes")
                        total
                    }
                }
                
                // Update database with correct progress information
                downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
                Log.d(TAG, "Updated database: $bytesWritten/$totalBytes bytes (${(bytesWritten.toFloat() / totalBytes * 100).toInt()}%) for ID: $downloadId")

                // Determine if we should append to the file
                val appendMode = file.exists() && response.code == 206
                Log.d(TAG, "Opening file in ${if (appendMode) "append" else "overwrite"} mode")
                
                FileOutputStream(file, appendMode).buffered().use { output ->
                    body.byteStream().buffered().use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var bytes = input.read(buffer)
                        
                        while (bytes >= 0) {
                            if (isStopped) {
                                Log.d(TAG, "Download cancelled during transfer for ID: $downloadId")
                                downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, "Download cancelled")
                                clearSensitiveHeaders(downloadId)
                                if (file.exists()) {
                                    file.delete()
                                    Log.d(TAG, "Deleted partial download file: ${file.absolutePath}")
                                }
                                return@withContext Result.failure()
                            }

                            val currentDownload = downloadDao.getDownload(downloadId)
                            if (currentDownload?.status == DownloadStatus.PAUSED) {
                                Log.d(TAG, "Download paused during transfer for ID: $downloadId")
                                return@withContext Result.retry()
                            }

                            output.write(buffer, 0, bytes)
                            bytesWritten += bytes

                            val currentTime = System.currentTimeMillis()
                            if (currentTime - lastProgressUpdate >= progressInterval) {
                                val progress = workDataOf(
                                    KEY_PROGRESS to bytesWritten,
                                    KEY_TOTAL to totalBytes
                                )
                                Log.d(TAG, "Progress: $bytesWritten/$totalBytes bytes for ID: $downloadId")
                                setProgress(progress)
                                downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
                                lastProgressUpdate = currentTime
                            }
                            
                            bytes = input.read(buffer)
                        }
                    }
                }

                Log.d(TAG, "Download completed successfully for ID: $downloadId")
                downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.COMPLETED)
                clearSensitiveHeaders(downloadId)
                return@withContext Result.success()
            }

            Log.e(TAG, "No response body for ID: $downloadId")
            deletePartialFile(file, "empty response body")
            downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, "Download failed: Empty response body")
            clearSensitiveHeaders(downloadId)
            return@withContext Result.failure()
        } catch (e: Exception) {
            Log.e(TAG, "Download failed", e)
            val downloadId = inputData.getString(KEY_DOWNLOAD_ID)
            downloadId?.let {
                Log.e(TAG, "Updating status to FAILED for ID: $it")
                val download = downloadDao.getDownload(it)
                if (download?.status == DownloadStatus.CANCELLED) {
                    clearSensitiveHeaders(it)
                    return@withContext Result.failure()
                }
                if (download?.status == DownloadStatus.PAUSED) {
                    return@withContext Result.retry()
                }

                download?.destination?.let { destination ->
                    deletePartialFile(File(destination), "download failure")
                }
                downloadDao.updateStatus(it, DownloadStatus.FAILED, e.message)
                clearSensitiveHeaders(it)
            }
            return@withContext Result.failure()
        }
    }

    companion object {
        private const val TAG = "DownloadWorker"
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_PROGRESS = "progress"
        const val KEY_TOTAL = "total"
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

class ProgressInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalResponse = chain.proceed(chain.request())
        val originalBody = originalResponse.body
        
        return originalResponse.newBuilder()
            .body(if (originalBody != null) ProgressResponseBody(originalBody) else null)
            .build()
    }
}
