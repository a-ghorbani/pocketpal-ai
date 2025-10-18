package com.pocketpal.download

import android.util.Log
import androidx.lifecycle.Observer
import androidx.work.*
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pocketpal.specs.NativeDownloadModuleSpec
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import java.io.File
import java.util.*
import androidx.concurrent.futures.await

@ReactModule(name = NativeDownloadModuleSpec.NAME)
class DownloadModule(reactContext: ReactApplicationContext) : NativeDownloadModuleSpec(reactContext) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val downloadDao = DownloadDatabase.getInstance(reactContext).downloadDao()
    private val workManager = WorkManager.getInstance(reactContext)
    // Map to store work observers by download ID
    private val workObservers = mutableMapOf<String, Observer<List<WorkInfo>>>()

    init {
        Log.d(TAG, "Initializing DownloadModule")

        scope.launch {
            Log.d(TAG, "Logging initial download database state")
            logEntireDownloadDatabase()
        }
    }

    override fun addListener(eventName: String) {
        Log.d(TAG, "Adding listener for event: $eventName")
    }

    override fun removeListeners(count: Double) {
        Log.d(TAG, "Removing ${count.toInt()} listeners")
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        Log.d(TAG, "Sending event: $eventName with params: $params")
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun removeWorkObserver(downloadId: String) {
        workObservers.remove(downloadId)?.let { observer ->
            Log.d(TAG, "Removing work observer for download: $downloadId")
            val workName = getWorkName(downloadId)
            workManager.getWorkInfosForUniqueWorkLiveData(workName)
                .removeObserver(observer)
        }
    }

    override fun startDownload(url: String, config: ReadableMap, promise: Promise) {
        Log.d(TAG, "Starting download with config: $config")
        scope.launch {
            try {
                val downloadId = UUID.randomUUID().toString()
                Log.d(TAG, "Generated download ID: $downloadId")

                val destination = config.getString("destination")
                    ?: throw IllegalArgumentException("Destination path is required")
                Log.d(TAG, "Destination path: $destination")

                // Extract authorization token if provided
                val authToken = if (config.hasKey("authToken")) config.getString("authToken") else null
                if (authToken != null) {
                    Log.d(TAG, "Authorization token provided for download")
                }

                val networkType = when (config.getString("networkType")) {
                    "WIFI" -> NetworkType.WIFI
                    else -> NetworkType.ANY
                }
                Log.d(TAG, "Network type: $networkType")

                val progressInterval = config.getDouble("progressInterval")?.toLong()
                    ?: DownloadWorker.DEFAULT_PROGRESS_INTERVAL
                Log.d(TAG, "Progress interval: $progressInterval ms")

                val priority = if (config.hasKey("priority")) {
                    config.getInt("priority")
                } else {
                    0
                }
                Log.d(TAG, "Priority: $priority")

                val download = DownloadEntity(
                    id = downloadId,
                    url = url,
                    destination = destination,
                    totalBytes = 0,
                    downloadedBytes = 0,
                    status = DownloadStatus.QUEUED,
                    priority = priority,
                    networkType = networkType,
                    createdAt = System.currentTimeMillis(),
                    authToken = authToken
                )

                withContext(Dispatchers.IO) {
                    Log.d(TAG, "Inserting download into database: $download")
                    downloadDao.insertDownload(download)
                }

                val workRequest = DownloadWorker.createWorkRequest(downloadId, progressInterval)
                Log.d(TAG, "Created work request: ${workRequest.id}")
                
                createAndRegisterObserver(downloadId)

                // Enqueue the work
                workManager.enqueueUniqueWork(
                    getWorkName(downloadId),
                    androidx.work.ExistingWorkPolicy.REPLACE,
                    workRequest
                )

                val response = Arguments.createMap().apply {
                    putString("downloadId", downloadId)
                }
                Log.d(TAG, "Resolving promise with download ID: $downloadId")
                promise.resolve(response)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start download", e)
                promise.reject("DOWNLOAD_ERROR", e.message)
            }
        }
    }

    override fun reattachDownloadObserver(downloadId: String, promise: Promise) {
        Log.d(TAG, "Re-attaching observer for download: $downloadId")
        scope.launch {
            try {
                val download = withContext(Dispatchers.IO) {
                    downloadDao.getDownload(downloadId)
                }
                
                if (download == null) {
                    Log.w(TAG, "No download found to re-attach observer: $downloadId")
                    promise.reject("DOWNLOAD_NOT_FOUND", "Download not found")
                    return@launch
                }
                
                createAndRegisterObserver(downloadId)
                
                Log.d(TAG, "Successfully re-attached observer for download: $downloadId")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to re-attach observer for download: $downloadId", e)
                promise.reject("REATTACH_ERROR", e.message)
            }
        }
    }

    override fun getActiveDownloads(promise: Promise) {
        Log.d(TAG, "Getting active downloads")
        scope.launch {
            try {
                val downloads = withContext(Dispatchers.IO) {
                    Log.d(TAG, "Fetching downloads from database")
                    downloadDao.getAllDownloads().first()
                        .filter { 
                            it.status == DownloadStatus.QUEUED || 
                            it.status == DownloadStatus.RUNNING ||
                            it.status == DownloadStatus.PAUSED 
                        }
                }
                Log.d(TAG, "Found ${downloads.size} active downloads")

                val result = Arguments.createArray()
                downloads.forEach { download ->
                    Log.d(TAG, "Processing download: ${download.id}")
                    result.pushMap(Arguments.createMap().apply {
                        putString("id", download.id)
                        putString("url", download.url)
                        putString("destination", download.destination)
                        putDouble("progress", 
                            if (download.totalBytes > 0) 
                                (download.downloadedBytes.toDouble() / download.totalBytes.toDouble()) * 100 
                            else 0.0
                        )
                        putString("status", download.status.name)
                    })
                }
                Log.d(TAG, "Resolving promise with ${downloads.size} downloads")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get active downloads", e)
                promise.reject("FETCH_ERROR", e.message)
            }
        }
    }

    override fun logDownloadDatabase(promise: Promise) {
        Log.d(TAG, "Logging download database state (requested from JS)")
        scope.launch {
            try {
                logEntireDownloadDatabase()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to log download database", e)
                promise.reject("LOG_ERROR", e.message)
            }
        }
    }

    override fun pauseDownload(downloadId: String, promise: Promise) {
        Log.d(TAG, "Pausing download: $downloadId")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Log.d(TAG, "Updating status to PAUSED for: $downloadId")
                    downloadDao.updateStatus(downloadId, DownloadStatus.PAUSED)
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to pause download: $downloadId", e)
                promise.reject("PAUSE_ERROR", e.message)
            }
        }
    }

    override fun resumeDownload(downloadId: String, promise: Promise) {
        Log.d(TAG, "Resuming download: $downloadId")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val download = downloadDao.getDownload(downloadId)
                    if (download != null) {
                        Log.d(TAG, "Updating status to QUEUED for: $downloadId")
                        downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED)
                        
                        // Create new work request only if there isn't one running
                        val workName = getWorkName(downloadId)
                        val workInfo = workManager.getWorkInfosForUniqueWork(workName).await().firstOrNull()
                        if (workInfo == null || workInfo.state.isFinished) {
                            Log.d(TAG, "Creating new work request for: $downloadId")
                            val workRequest = DownloadWorker.createWorkRequest(downloadId)
                            workManager.enqueueUniqueWork(
                                workName,
                                androidx.work.ExistingWorkPolicy.REPLACE,
                                workRequest
                            )
                        } else {
                            Log.d(TAG, "Work is already running for: $downloadId")
                        }
                    } else {
                        Log.w(TAG, "No download found to resume: $downloadId")
                    }
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to resume download: $downloadId", e)
                promise.reject("RESUME_ERROR", e.message)
            }
        }
    }

    override fun retryDownload(downloadId: String, promise: Promise) {
        Log.d(TAG, "Retrying download: $downloadId")
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val download = downloadDao.getDownload(downloadId)
                    if (download != null) {
                        Log.d(TAG, "Updating status to QUEUED for: $downloadId")
                        downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED)
                        Log.d(TAG, "Creating new work request for: $downloadId")
                        val workRequest = DownloadWorker.createWorkRequest(downloadId)
                        workManager.enqueue(workRequest)
                    } else {
                        Log.w(TAG, "No download found to retry: $downloadId")
                    }
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to retry download: $downloadId", e)
                promise.reject("RETRY_ERROR", e.message)
            }
        }
    }

    override fun cancelDownload(downloadId: String, promise: Promise) {
        Log.d(TAG, "Cancelling download: $downloadId")
        scope.launch {
            try {
                // First update the database to mark as cancelled
                withContext(Dispatchers.IO) {
                    val download = downloadDao.getDownload(downloadId)
                    if (download != null) {
                        Log.d(TAG, "Updating status to CANCELLED for download: $downloadId")
                        downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, "Download cancelled by user")
                        
                        // Clean up the partial download file
                        val file = File(download.destination)
                        if (file.exists()) {
                            Log.d(TAG, "Deleting partial download file: ${file.absolutePath}")
                            file.delete()
                        }
                    }
                }

                // Cancel the work using the work name format
                val workName = getWorkName(downloadId)
                val operation = workManager.cancelUniqueWork(workName)
                
                // Wait for cancellation to complete
                withContext(Dispatchers.IO) {
                    try {
                        operation.result.await()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error waiting for work cancellation", e)
                    }
                }

                // Force stop any ongoing work
                workManager.pruneWork()
                
                // Send cancellation event to notify the JS side
                sendCancellationEvent(downloadId)
                
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to cancel download: $downloadId", e)
                promise.reject("CANCEL_ERROR", e.message)
            }
        }
    }

    private fun sendProgressEvent(downloadId: String, bytesWritten: Long, totalBytes: Long) {
        val params = Arguments.createMap().apply {
            putString("downloadId", downloadId)
            putDouble("bytesWritten", bytesWritten.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putDouble("progress", if (totalBytes > 0) (bytesWritten.toDouble() / totalBytes.toDouble()) * 100 else 0.0)
        }
        sendEvent("onDownloadProgress", params)
    }

    private fun sendCompletionEvent(downloadId: String, filePath: String) {
        val params = Arguments.createMap().apply {
            putString("downloadId", downloadId)
            putString("filePath", filePath)
        }
        sendEvent("onDownloadComplete", params)
    }

    private fun sendFailureEvent(downloadId: String, error: String) {
        val params = Arguments.createMap().apply {
            putString("downloadId", downloadId)
            putString("error", error)
        }
        sendEvent("onDownloadFailed", params)
    }

    private fun sendCancellationEvent(downloadId: String) {
        val params = Arguments.createMap().apply {
            putString("downloadId", downloadId)
            putString("message", "Download cancelled by user")
        }
        sendEvent("onDownloadCancelled", params)
    }

    override fun onCatalystInstanceDestroy() {
        Log.d(TAG, "Cleaning up DownloadModule")
        // Clean up all observers
        workObservers.entries.forEach { (downloadId, observer) ->
            removeWorkObserver(downloadId)
        }
        workObservers.clear()
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }

    // Helper function to log the current state of a download in the database
    private suspend fun logDownloadDatabaseState(downloadId: String) {
        withContext(Dispatchers.IO) {
            try {
                val download = downloadDao.getDownload(downloadId)
                if (download != null) {
                    Log.d(TAG, "DB STATE for $downloadId: " +
                        "status=${download.status}, " +
                        "progress=${download.downloadedBytes}/${download.totalBytes} bytes " +
                        "(${if (download.totalBytes > 0) (download.downloadedBytes.toFloat() / download.totalBytes * 100).toInt() else 0}%), " +
                        "error=${download.error ?: "none"}")
                } else {
                    Log.d(TAG, "DB STATE for $downloadId: No record found in database")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to log database state for $downloadId", e)
            }
        }
    }

    // Helper function to log the entire download database
    private suspend fun logEntireDownloadDatabase() {
        withContext(Dispatchers.IO) {
            try {
                val allDownloads = downloadDao.getAllDownloads().first()
                if (allDownloads.isEmpty()) {
                    Log.d(TAG, "DOWNLOAD DATABASE: Empty - No downloads found")
                    return@withContext
                }
                
                Log.d(TAG, "DOWNLOAD DATABASE: Found ${allDownloads.size} downloads")
                Log.d(TAG, "DOWNLOAD DATABASE: ----------------------------------------")
                
                allDownloads.forEachIndexed { index, download ->
                    val progressPercent = if (download.totalBytes > 0) 
                        (download.downloadedBytes.toFloat() / download.totalBytes * 100).toInt() 
                    else 0
                    
                    Log.d(TAG, "DOWNLOAD #${index + 1}:")
                    Log.d(TAG, "  ID: ${download.id}")
                    Log.d(TAG, "  URL: ${download.url}")
                    Log.d(TAG, "  Destination: ${download.destination}")
                    Log.d(TAG, "  Status: ${download.status}")
                    Log.d(TAG, "  Progress: ${download.downloadedBytes}/${download.totalBytes} bytes ($progressPercent%)")
                    Log.d(TAG, "  Priority: ${download.priority}")
                    Log.d(TAG, "  Network Type: ${download.networkType}")
                    Log.d(TAG, "  Created At: ${java.util.Date(download.createdAt)}")
                    Log.d(TAG, "  Error: ${download.error ?: "none"}")
                    Log.d(TAG, "  ----------------------------------------")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to log download database", e)
            }
        }
    }

    private fun createAndRegisterObserver(downloadId: String): Observer<List<WorkInfo>> {
        Log.d(TAG, "Creating observer for download: $downloadId")
        
        // Create a new observer for this download
        val observer = Observer<List<WorkInfo>> { workInfos ->
            val workInfo = workInfos.firstOrNull() ?: return@Observer
            Log.d(TAG, "Work state changed: ${workInfo.state} for ID: $downloadId")
            
            when (workInfo.state) {
                WorkInfo.State.RUNNING -> {
                    val progress = workInfo.progress.getLong(DownloadWorker.KEY_PROGRESS, 0)
                    val total = workInfo.progress.getLong(DownloadWorker.KEY_TOTAL, 0)
                    Log.d(TAG, "Download progress: $progress/$total for ID: $downloadId")
                    sendProgressEvent(downloadId, progress, total)
                }
                WorkInfo.State.SUCCEEDED -> {
                    Log.d(TAG, "Download succeeded for ID: $downloadId")
                    scope.launch {
                        val downloadInfo = downloadDao.getDownload(downloadId)
                        if (downloadInfo != null) {
                            Log.d(TAG, "Sending completion event for ID: $downloadId")
                            sendCompletionEvent(downloadId, downloadInfo.destination)
                        } else {
                            Log.w(TAG, "Download info not found for completed download: $downloadId")
                        }
                            
                        // Log final database state after completion
                        logEntireDownloadDatabase()
                            
                        removeWorkObserver(downloadId)
                    }
                }
                WorkInfo.State.FAILED -> {
                    Log.e(TAG, "Download failed for ID: $downloadId")
                    scope.launch {
                        val downloadInfo = downloadDao.getDownload(downloadId)
                        if (downloadInfo != null) {
                            Log.e(TAG, "Error details for ID $downloadId: ${downloadInfo.error}")
                            sendFailureEvent(downloadId, downloadInfo.error ?: "Unknown error")
                        } else {
                            Log.w(TAG, "Download info not found for failed download: $downloadId")
                        }
                            
                        // Log final database state after failure
                        logEntireDownloadDatabase()
                            
                        removeWorkObserver(downloadId)
                    }
                }
                WorkInfo.State.CANCELLED -> {
                    Log.d(TAG, "Download cancelled for ID: $downloadId")
                    
                    // Log final database state after cancellation
                    scope.launch {
                        logEntireDownloadDatabase()
                        removeWorkObserver(downloadId)
                    }
                }
                else -> {
                    Log.d(TAG, "Work state: ${workInfo.state} for ID: $downloadId")
                }
            }
        }
        
        // Remove any existing observer
        workObservers[downloadId]?.let { oldObserver ->
            Log.d(TAG, "Removing existing observer for download: $downloadId")
            val workName = getWorkName(downloadId)
            workManager.getWorkInfosForUniqueWorkLiveData(workName)
                .removeObserver(oldObserver)
        }
        
        // Register the new observer
        workObservers[downloadId] = observer
        val workName = getWorkName(downloadId)
        workManager.getWorkInfosForUniqueWorkLiveData(workName)
            .observeForever(observer)
        
        return observer
    }

    companion object {
        private const val TAG = "DownloadModule"
        private fun getWorkName(downloadId: String) = "download_$downloadId"
    }
} 