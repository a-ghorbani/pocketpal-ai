package com.pocketpal.speech

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import java.lang.ref.WeakReference

data class SpeechPlaybackCopy(val title: String, val stopLabel: String, val channelName: String)

/**
 * The process's one speech service state. It outlives any React instance, so
 * a reload never loses track of a running service. Main thread only.
 */
internal object SpeechPlayback {
    const val STOP_EVENT = "speechPlaybackStop"

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var context: Context
    private var reactContext = WeakReference<ReactApplicationContext>(null)

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

    fun attach(react: ReactApplicationContext) {
        context = react.applicationContext
        reactContext = WeakReference(react)
    }

    fun detach(react: ReactApplicationContext) {
        if (reactContext.get() === react) {
            reactContext.clear()
        }
    }

    /** The user asked to stop: tell JS, which stops speech and then the service. */
    fun requestStop() {
        val react = reactContext.get() ?: return
        if (react.hasActiveReactInstance()) {
            react.emitDeviceEvent(STOP_EVENT)
        }
    }

    fun start(copy: SpeechPlaybackCopy) {
        this.copy = copy
        controller.start()
    }

    private fun serviceIntent() = Intent(context, SpeechPlaybackService::class.java)
}
