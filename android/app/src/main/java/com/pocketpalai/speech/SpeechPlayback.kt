package com.pocketpal.speech

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat

data class SpeechPlaybackCopy(val title: String, val stopLabel: String, val channelName: String)

/**
 * The process's one speech service state. It outlives any React instance, so
 * a reload never loses track of a running service. Main thread only.
 */
internal object SpeechPlayback {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var context: Context

    var copy = SpeechPlaybackCopy("", "", "")
        private set

    val controller = SpeechPlaybackController(object : SpeechPlaybackController.Port {
        override fun startService() {
            ContextCompat.startForegroundService(context, serviceIntent())
        }

        override fun stopService() {
            context.stopService(serviceIntent())
        }

        override fun schedule(delayMs: Long, action: () -> Unit) {
            handler.removeCallbacksAndMessages(null)
            handler.postDelayed(action, delayMs)
        }

        override fun cancelScheduled() {
            handler.removeCallbacksAndMessages(null)
        }
    })

    fun attach(appContext: Context) {
        context = appContext
    }

    fun start(copy: SpeechPlaybackCopy) {
        this.copy = copy
        controller.start()
    }

    private fun serviceIntent() = Intent(context, SpeechPlaybackService::class.java)
}
