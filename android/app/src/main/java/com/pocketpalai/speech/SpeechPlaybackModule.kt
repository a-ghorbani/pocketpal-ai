package com.pocketpal.speech

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeSpeechPlaybackSpec

@ReactModule(name = NativeSpeechPlaybackSpec.NAME)
class SpeechPlaybackModule(reactContext: ReactApplicationContext) :
    NativeSpeechPlaybackSpec(reactContext) {

    init {
        UiThreadUtil.runOnUiThread { SpeechPlayback.attach(reactContext) }
    }

    override fun addListener(eventName: String) = Unit

    override fun removeListeners(count: Double) = Unit

    override fun start(copy: ReadableMap, promise: Promise) {
        val playbackCopy = SpeechPlaybackCopy(
            title = copy.getString("title").orEmpty(),
            stopLabel = copy.getString("stopLabel").orEmpty(),
            channelName = copy.getString("channelName").orEmpty(),
        )
        UiThreadUtil.runOnUiThread {
            try {
                SpeechPlayback.start(playbackCopy)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject(START_FAILED, e.message, e)
            }
        }
    }

    override fun stop() {
        UiThreadUtil.runOnUiThread { SpeechPlayback.controller.stop() }
    }

    override fun invalidate() {
        val react = reactApplicationContext
        UiThreadUtil.runOnUiThread {
            SpeechPlayback.detach(react)
            SpeechPlayback.controller.stop(lingerMs = 0)
        }
        super.invalidate()
    }

    companion object {
        private const val START_FAILED = "speech_playback_start_failed"
    }
}
