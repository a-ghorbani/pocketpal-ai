package com.pocketpal.download

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Call
import java.util.concurrent.ConcurrentHashMap

class StopSignal {
    @Volatile
    var stopped = false
        private set

    @Volatile
    var userStop = false
        private set

    @Volatile
    var call: Call? = null

    fun stop(user: Boolean) {
        if (user) userStop = true
        stopped = true
        call?.cancel()
    }
}

class DownloadRuns {
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val signals = ConcurrentHashMap<String, Set<StopSignal>>()
    private val reportOnce: MutableSet<String> = ConcurrentHashMap.newKeySet()

    suspend fun <T> withDestinationLock(destination: String, block: suspend () -> T): T =
        locks.computeIfAbsent(destination) { Mutex() }.withLock { block() }

    fun register(downloadId: String): StopSignal {
        val signal = StopSignal()
        signals.merge(downloadId, setOf(signal)) { live, added -> live + added }
        return signal
    }

    fun unregister(downloadId: String, signal: StopSignal) {
        signals.computeIfPresent(downloadId) { _, live -> (live - signal).ifEmpty { null } }
    }

    fun stop(downloadId: String) {
        signals[downloadId]?.forEach { it.stop(user = false) }
    }

    fun isActive(downloadId: String): Boolean = !signals[downloadId].isNullOrEmpty()

    fun markReportOnce(downloadId: String) {
        reportOnce.add(downloadId)
    }

    fun clearReportOnce(downloadId: String) {
        reportOnce.remove(downloadId)
    }

    fun reportOnceIds(): Set<String> = reportOnce.toSet()

    companion object {
        val process = DownloadRuns()
    }
}
