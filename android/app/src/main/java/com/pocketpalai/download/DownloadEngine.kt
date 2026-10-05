package com.pocketpal.download

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.pocketpal.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLPeerUnverifiedException

class DownloadEngine(
    private val dao: DownloadDao,
    private val runs: DownloadRuns,
    private val client: OkHttpClient = sharedClient,
    private val now: () -> Long = SystemClock::elapsedRealtime,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
    private val openPart: (File, Boolean) -> OutputStream = { file, append ->
        BufferedOutputStream(FileOutputStream(file, append), BUFFER_SIZE)
    },
) {
    enum class Outcome { RESCHEDULE, DONE }

    private sealed interface End {
        data object Completed : End
        data object Superseded : End
        data object Stopped : End
        data class Failed(val error: String) : End
        data class GaveUp(val wroteBytes: Boolean) : End
    }

    private sealed interface Attempt {
        data class Finished(val end: End) : Attempt
        data object Transient : Attempt
        data object Restart : Attempt
    }

    suspend fun run(
        downloadId: String,
        signal: StopSignal,
        progressIntervalMs: Long,
        onProgress: (downloadedBytes: Long, totalBytes: Long) -> Unit = { _, _ -> },
    ): Outcome {
        val destination = dao.getDownload(downloadId)?.destination ?: return Outcome.DONE
        return runs.withDestinationLock(destination) {
            if (dao.casStatus(downloadId, ENTRY_STATES, DownloadStatus.RUNNING) == 0) {
                return@withDestinationLock Outcome.DONE
            }
            val row = dao.getDownload(downloadId) ?: return@withDestinationLock Outcome.DONE
            val transfer = Transfer(row, signal, progressIntervalMs, onProgress)
            val loop = CoroutineScope(Dispatchers.IO).async { runCatching { transfer.run() } }
            try {
                val end = loop.await().getOrElse { error ->
                    if (signal.stopped) End.Stopped else End.Failed(error.message ?: error.javaClass.simpleName)
                }
                withContext(NonCancellable) { finish(row, signal, end) }
            } catch (e: CancellationException) {
                signal.stop(user = false)
                withContext(NonCancellable) {
                    finish(row, signal, loop.await().getOrNull() ?: End.Stopped)
                }
                throw e
            }
        }
    }

    private suspend fun finish(row: DownloadEntity, signal: StopSignal, end: End): Outcome {
        val id = row.id
        Log.d(TAG, "Run for $id ended: $end")
        return when (end) {
            End.Completed -> {
                dao.casStatus(id, RUNNING, DownloadStatus.COMPLETED)
                Outcome.DONE
            }
            End.Superseded -> {
                dao.casStatus(id, RUNNING, DownloadStatus.CANCELLED)
                Outcome.DONE
            }
            End.Stopped -> if (signal.userStop) {
                dao.casStatus(id, RUNNING, DownloadStatus.FAILED, STOPPED_ERROR)
                Outcome.DONE
            } else if (dao.casStatus(id, RUNNING, DownloadStatus.QUEUED) == 1) {
                Outcome.RESCHEDULE
            } else {
                Outcome.DONE
            }
            is End.Failed -> {
                val part = File(row.destination + PART_SUFFIX)
                dao.fail(id, end.error, if (part.exists()) part.length() else 0)
                Outcome.DONE
            }
            is End.GaveUp -> {
                val stalledRuns = if (end.wroteBytes) 0 else row.stalledRuns + 1
                if (stalledRuns >= MAX_STALLED_RUNS) {
                    dao.endTransientRun(id, stalledRuns, DownloadStatus.FAILED, STALLED_ERROR)
                    Outcome.DONE
                } else if (dao.endTransientRun(id, stalledRuns, DownloadStatus.QUEUED) == 1) {
                    Outcome.RESCHEDULE
                } else {
                    Outcome.DONE
                }
            }
        }
    }

    private inner class Transfer(
        private val row: DownloadEntity,
        private val signal: StopSignal,
        private val progressIntervalMs: Long,
        private val onProgress: (Long, Long) -> Unit,
    ) {
        private val file = File(row.destination)
        private val part = File(row.destination + PART_SUFFIX)
        private var etag = row.etag
        private var totalBytes = row.totalBytes
        private var lastByteAt = now()
        private var bytesWritten = 0L

        suspend fun run(): End {
            adopt()?.let { return it }
            var restarted = false
            var backoffMs = INITIAL_BACKOFF_MS
            var bytesAtLastFailure = 0L
            while (true) {
                if (signal.stopped) return End.Stopped
                when (val attempt = attempt(if (part.exists()) part.length() else 0L)) {
                    is Attempt.Finished -> return if (attempt.end == End.Completed) commit() else attempt.end
                    Attempt.Restart -> {
                        part.delete()
                        if (restarted) return End.Failed(REMOTE_CHANGED_ERROR)
                        restarted = true
                        etag = null
                        totalBytes = 0
                    }
                    Attempt.Transient -> {
                        if (bytesWritten > bytesAtLastFailure) backoffMs = INITIAL_BACKOFF_MS
                        bytesAtLastFailure = bytesWritten
                        if (now() - lastByteAt >= GIVE_UP_AFTER_MS) return End.GaveUp(bytesWritten > 0)
                        sleepUnlessStopped(backoffMs)
                        backoffMs = minOf(backoffMs * 2, MAX_BACKOFF_MS)
                    }
                }
            }
        }

        private suspend fun adopt(): End? {
            if (part.exists() || !file.exists()) return null
            val newerCompleted = dao.byDestination(row.destination).any {
                it.id != row.id && it.status == DownloadStatus.COMPLETED && it.createdAt > row.createdAt
            }
            if (newerCompleted) return End.Superseded
            if (row.totalBytes <= 0) {
                Log.d(TAG, "Discarding in-place file of unknown size for ${row.id}")
                if (!file.delete()) return End.Failed("Could not remove the previous download")
                return null
            }
            if (file.length() == row.totalBytes) {
                dao.writeProgress(row.id, row.totalBytes, row.totalBytes)
                return End.Completed
            }
            Log.d(TAG, "Adopting in-place partial for ${row.id} as ${part.name}")
            if (!file.renameTo(part)) return End.Failed("Could not move the partial download aside")
            return null
        }

        private suspend fun attempt(offset: Long): Attempt {
            val call = client.newCall(request(offset))
            signal.call = call
            if (signal.stopped) call.cancel()
            return try {
                call.execute().use { respond(it, offset) }
            } catch (e: SSLPeerUnverifiedException) {
                Attempt.Finished(if (signal.stopped) End.Stopped else End.Failed(e.message ?: "TLS peer not verified"))
            } catch (e: IOException) {
                if (signal.stopped) {
                    Attempt.Finished(End.Stopped)
                } else {
                    Log.w(TAG, "Transient error for ${row.id}: $e")
                    Attempt.Transient
                }
            } finally {
                signal.call = null
            }
        }

        private fun request(offset: Long): Request =
            Request.Builder()
                .url(row.url)
                .header("User-Agent", "PocketPal/${BuildConfig.VERSION_NAME} (ai.pocketpal)")
                .apply {
                    row.authToken?.let { header("Authorization", "Bearer $it") }
                    if (offset > 0) {
                        header("Range", "bytes=$offset-")
                        etag?.let { header("If-Range", it) }
                    }
                }
                .build()

        private suspend fun respond(response: Response, offset: Long): Attempt {
            val code = response.code
            Log.d(TAG, "Response $code for ${row.id} at offset $offset")
            return when {
                code == 200 -> {
                    etag = strongEtag(response)
                    totalBytes = response.body?.contentLength()?.takeIf { it > 0 } ?: 0
                    if (dao.writeValidators(row.id, etag, totalBytes, 0) == 0) return Attempt.Finished(End.Stopped)
                    write(response, append = false, start = 0)
                }
                code == 206 -> {
                    val range = CONTENT_RANGE.find(response.header("Content-Range").orEmpty())
                        ?: return Attempt.Restart
                    val start = range.groupValues[1].toLong()
                    val total = range.groupValues[3].toLongOrNull() ?: 0
                    val responseEtag = strongEtag(response)
                    val valid = start == offset &&
                        (totalBytes <= 0 || total == totalBytes) &&
                        (etag == null || responseEtag == null || responseEtag == etag)
                    if (!valid) return Attempt.Restart
                    if ((etag == null && responseEtag != null) || (totalBytes <= 0 && total > 0)) {
                        etag = etag ?: responseEtag
                        if (totalBytes <= 0) totalBytes = total
                        if (dao.writeValidators(row.id, etag, totalBytes, offset) == 0) return Attempt.Finished(End.Stopped)
                    }
                    write(response, append = true, start = offset)
                }
                code == 416 -> {
                    val total = UNSATISFIED_RANGE.find(response.header("Content-Range").orEmpty())
                        ?.groupValues?.get(1)?.toLongOrNull()
                    val complete = offset > 0 && (if (totalBytes > 0) offset == totalBytes else total == offset)
                    if (!complete) return Attempt.Restart
                    totalBytes = offset
                    Attempt.Finished(End.Completed)
                }
                code == 408 || code == 429 || code in 500..599 -> Attempt.Transient
                code in 400..499 -> Attempt.Finished(End.Failed("Client error: $code"))
                else -> Attempt.Finished(End.Failed("Unexpected response: $code"))
            }
        }

        private suspend fun write(response: Response, append: Boolean, start: Long): Attempt {
            val body = response.body ?: return Attempt.Transient
            val output = try {
                openPart(part, append)
            } catch (e: IOException) {
                return Attempt.Finished(End.Failed(storageError(e)))
            }
            var written = start
            var lastProgressAt = now()
            output.use { out ->
                val input = body.byteStream()
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    storageFailure { out.write(buffer, 0, read) }?.let { return it }
                    written += read
                    bytesWritten += read
                    lastByteAt = now()
                    if (signal.stopped) return Attempt.Finished(End.Stopped)
                    if (lastByteAt - lastProgressAt >= progressIntervalMs) {
                        lastProgressAt = lastByteAt
                        storageFailure { out.flush() }?.let { return it }
                        if (dao.writeProgress(row.id, written, totalBytes) == 0) return Attempt.Finished(End.Stopped)
                        onProgress(written, totalBytes)
                    }
                }
                storageFailure { out.flush() }?.let { return it }
            }
            return Attempt.Finished(End.Completed)
        }

        private inline fun storageFailure(write: () -> Unit): Attempt? =
            try {
                write()
                null
            } catch (e: IOException) {
                Attempt.Finished(End.Failed(storageError(e)))
            }

        private suspend fun commit(): End {
            val length = part.length()
            if (dao.writeProgress(row.id, length, totalBytes) == 0) return End.Stopped
            onProgress(length, totalBytes)
            if (totalBytes > 0 && length != totalBytes) {
                Log.e(TAG, "Size mismatch for ${row.id}: $length != $totalBytes")
                part.delete()
                return End.Failed(SIZE_MISMATCH_ERROR)
            }
            if (!part.renameTo(file)) return End.Failed("Could not move the finished download into place")
            return End.Completed
        }

        private suspend fun sleepUnlessStopped(durationMs: Long) {
            var remaining = durationMs
            while (remaining > 0 && !signal.stopped) {
                val step = minOf(remaining, SLEEP_STEP_MS)
                sleep(step)
                remaining -= step
            }
        }
    }

    private fun strongEtag(response: Response): String? =
        response.header("ETag")?.takeUnless { it.startsWith("W/") }

    private fun storageError(e: IOException) = "Could not write the download: ${e.message}"

    companion object {
        private const val TAG = "DownloadEngine"
        const val PART_SUFFIX = ".part"
        const val STOPPED_ERROR = "Download stopped"
        const val STALLED_ERROR = "Download stalled: no data received"
        const val REMOTE_CHANGED_ERROR = "Remote file changed during download"
        const val SIZE_MISMATCH_ERROR = "Downloaded file size does not match the expected size"
        const val MAX_STALLED_RUNS = 5
        const val GIVE_UP_AFTER_MS = 120_000L
        private const val INITIAL_BACKOFF_MS = 2_000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val SLEEP_STEP_MS = 250L
        private const val BUFFER_SIZE = 64 * 1024
        private val ENTRY_STATES = listOf(DownloadStatus.QUEUED.name, DownloadStatus.RUNNING.name)
        private val RUNNING = listOf(DownloadStatus.RUNNING.name)
        private val CONTENT_RANGE = Regex("""bytes (\d+)-(\d+)/(\d+|\*)""")
        private val UNSATISFIED_RANGE = Regex("""bytes \*/(\d+)""")

        val sharedClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .readTimeout(60, TimeUnit.SECONDS)
                .build()
        }

        @Volatile
        private var instance: DownloadEngine? = null

        fun get(context: Context): DownloadEngine =
            instance ?: synchronized(this) {
                instance ?: DownloadEngine(
                    DownloadDatabase.getInstance(context.applicationContext).downloadDao(),
                    DownloadRuns.process,
                ).also { instance = it }
            }
    }
}
