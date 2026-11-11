package com.pocketpal.speech

/**
 * The speech foreground service's lifecycle. Driven on the main thread only.
 *
 * A service started with startForegroundService must not be stopped before it
 * has called startForeground (the system crashes the app), so a stop that
 * arrives while starting waits for that call. A stop lingers briefly before the
 * service goes, so a play that follows a stop keeps the same notification.
 */
internal class SpeechPlaybackController(private val port: Port) {
    interface Port {
        fun startService()
        fun stopService()
        fun schedule(delayMs: Long, action: () -> Unit)
        fun cancelScheduled()
    }

    enum class State { NONE, STARTING, STARTING_STOP_PENDING, FOREGROUND, LINGERING }

    var state = State.NONE
        private set

    private var pendingLingerMs = LINGER_MS

    /** Throws when the system refuses the start; the state then stays [State.NONE]. */
    fun start() {
        when (state) {
            State.NONE -> {
                port.startService()
                state = State.STARTING
            }
            State.STARTING_STOP_PENDING -> state = State.STARTING
            State.LINGERING -> {
                port.cancelScheduled()
                state = State.FOREGROUND
            }
            State.STARTING, State.FOREGROUND -> Unit
        }
    }

    fun stop(lingerMs: Long = LINGER_MS) {
        when (state) {
            State.STARTING -> {
                pendingLingerMs = lingerMs
                state = State.STARTING_STOP_PENDING
            }
            State.FOREGROUND -> linger(lingerMs)
            State.NONE, State.STARTING_STOP_PENDING, State.LINGERING -> Unit
        }
    }

    fun onForegroundStarted() {
        when (state) {
            State.STARTING -> state = State.FOREGROUND
            State.STARTING_STOP_PENDING -> linger(pendingLingerMs)
            State.NONE, State.FOREGROUND, State.LINGERING -> Unit
        }
    }

    /** The service has already stopped itself. */
    fun onForegroundFailed() {
        if (state == State.STARTING || state == State.STARTING_STOP_PENDING) {
            state = State.NONE
        }
    }

    private fun linger(delayMs: Long) {
        state = State.LINGERING
        port.schedule(delayMs) {
            port.stopService()
            state = State.NONE
        }
    }

    companion object {
        const val LINGER_MS = 1_000L
    }
}
