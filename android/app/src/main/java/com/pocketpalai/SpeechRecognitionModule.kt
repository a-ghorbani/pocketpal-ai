package com.pocketpal

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.ModelDownloadListener
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pocketpal.specs.NativeSpeechRecognitionSpec
import java.util.concurrent.Executor
import kotlin.math.PI
import kotlin.math.sin

@ReactModule(name = NativeSpeechRecognitionSpec.NAME)
class SpeechRecognitionModule(
  private val reactContext: ReactApplicationContext
) : NativeSpeechRecognitionSpec(reactContext), LifecycleEventListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val mainExecutor = Executor { command -> mainHandler.post(command) }
  private var recognizer: SpeechRecognizer? = null
  private var activeRequestId: String? = null
  private var captureTimeout: Runnable? = null
  private var resultTimeout: Runnable? = null
  private var cueTrack: AudioTrack? = null
  private var cueCompletion: Runnable? = null
  private var cuePromise: Promise? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NativeSpeechRecognitionSpec.NAME

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  override fun playTurnCue(cue: String, promise: Promise) {
    runOnMain(promise) {
      val cueAudio = cueAudio(cue) ?: run {
        promise.reject("INVALID_CUE", "Unknown conversation turn cue")
        return@runOnMain
      }
      val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val keyguard = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (
        activeRequestId != null ||
        !reactContext.hasCurrentActivity() ||
        reactContext.lifecycleState != LifecycleState.RESUMED ||
        keyguard.isDeviceLocked ||
        audio.isStreamMute(AudioManager.STREAM_MUSIC) ||
        audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0
      ) {
        promise.resolve(false)
        return@runOnMain
      }
      finishTurnCue(false)
      var track: AudioTrack? = null
      try {
        track = AudioTrack.Builder()
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(CUE_SAMPLE_RATE)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build()
          )
          .setBufferSizeInBytes(cueAudio.samples.size * Short.SIZE_BYTES)
          .setTransferMode(AudioTrack.MODE_STATIC)
          .build()
        val written = track.write(
          cueAudio.samples,
          0,
          cueAudio.samples.size,
          AudioTrack.WRITE_BLOCKING
        )
        if (written != cueAudio.samples.size) {
          track.release()
          promise.reject("CUE_PLAYBACK_FAILED", "Unable to buffer conversation turn cue")
          return@runOnMain
        }
        track.setNotificationMarkerPosition(cueAudio.samples.size)
        track.setPlaybackPositionUpdateListener(
          object : AudioTrack.OnPlaybackPositionUpdateListener {
            override fun onMarkerReached(audioTrack: AudioTrack) {
              finishTurnCue(true)
            }

            override fun onPeriodicNotification(audioTrack: AudioTrack) = Unit
          },
          mainHandler
        )
        cueTrack = track
        cuePromise = promise
        cueCompletion = Runnable { finishTurnCue(true) }.also {
          mainHandler.postDelayed(it, cueAudio.durationMs + CUE_COMPLETION_GRACE_MS)
        }
        track.play()
      } catch (error: Exception) {
        cueCompletion?.let(mainHandler::removeCallbacks)
        cueCompletion = null
        cueTrack = null
        cuePromise = null
        track?.release()
        promise.reject("CUE_PLAYBACK_FAILED", error.message, error)
      }
    }
  }

  override fun cancelTurnCue(promise: Promise) {
    runOnMain(promise) {
      finishTurnCue(false)
      promise.resolve(null)
    }
  }

  private fun finishTurnCue(completed: Boolean) {
    cueCompletion?.let(mainHandler::removeCallbacks)
    cueCompletion = null
    cueTrack?.let { track ->
      if (track.playState == AudioTrack.PLAYSTATE_PLAYING) {
        track.stop()
      }
      track.release()
    }
    cueTrack = null
    cuePromise?.resolve(completed)
    cuePromise = null
  }

  private fun cueAudio(cue: String): CueAudio? {
    val segments = when (cue) {
      "narrationEnded" -> listOf(ToneSegment(880.0, 150))
      "listeningEnded" -> listOf(
        ToneSegment(1046.5, 90),
        ToneSegment(0.0, 55),
        ToneSegment(1318.5, 105)
      )
      else -> return null
    }
    val samples = segments.flatMap { segment ->
      val sampleCount = CUE_SAMPLE_RATE * segment.durationMs / 1000
      val fadeSamples = minOf(CUE_FADE_SAMPLES, sampleCount / 2)
      List(sampleCount) { index ->
        if (segment.frequencyHz == 0.0) {
          0
        } else {
          val envelope = when {
            index < fadeSamples -> index.toDouble() / fadeSamples
            index >= sampleCount - fadeSamples ->
              (sampleCount - index - 1).toDouble() / fadeSamples
            else -> 1.0
          }
          (
            sin(2.0 * PI * segment.frequencyHz * index / CUE_SAMPLE_RATE) *
              envelope *
              Short.MAX_VALUE *
              CUE_AMPLITUDE
          ).toInt()
        }
      }
    }.map(Int::toShort).toShortArray()
    return CueAudio(samples, segments.sumOf(ToneSegment::durationMs).toLong())
  }

  override fun getCapability(locale: String, promise: Promise) {
    runOnMain(promise) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        promise.resolve(capability(false, false, "unsupported", locale))
        return@runOnMain
      }
      if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext)) {
        promise.resolve(capability(false, true, "unsupported", locale))
        return@runOnMain
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.resolve(capability(true, true, "unknown", locale))
        return@runOnMain
      }

      val probe = try {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(reactContext)
      } catch (error: UnsupportedOperationException) {
        promise.resolve(capability(false, true, "unsupported", locale))
        return@runOnMain
      }
      try {
        probe.checkRecognitionSupport(
          recognitionIntent(locale),
          mainExecutor,
          object : RecognitionSupportCallback {
            override fun onSupportResult(support: RecognitionSupport) {
              val result = when {
                support.installedOnDeviceLanguages.contains(locale) -> "installed"
                support.pendingOnDeviceLanguages.contains(locale) -> "pending"
                support.supportedOnDeviceLanguages.contains(locale) -> "downloadable"
                else -> "unsupported"
              }
              probe.destroy()
              promise.resolve(capability(true, true, result, locale))
            }

            override fun onError(error: Int) {
              probe.destroy()
              promise.resolve(capability(true, true, "unknown", locale))
            }
          }
        )
      } catch (error: Exception) {
        probe.destroy()
        throw error
      }
    }
  }

  override fun start(requestId: String, locale: String, promise: Promise) {
    runOnMain(promise) {
      finishTurnCue(false)
      if (activeRequestId != null) {
        promise.reject("RECOGNIZER_BUSY", "A speech recognition request is already active")
        return@runOnMain
      }
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        promise.reject("UNSUPPORTED_ANDROID", "On-device speech recognition requires Android 12 or newer")
        return@runOnMain
      }
      if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext)) {
        promise.reject("ON_DEVICE_UNAVAILABLE", "No on-device speech recognition service is available")
        return@runOnMain
      }
      if (
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO) !=
          PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("PERMISSION_DENIED", "Microphone permission is not granted")
        return@runOnMain
      }
      val keyguard = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (
        !reactContext.hasCurrentActivity() ||
        reactContext.lifecycleState != LifecycleState.RESUMED ||
        keyguard.isDeviceLocked
      ) {
        promise.reject("NOT_FOREGROUND", "PocketPal must be visible and unlocked")
        return@runOnMain
      }

      val created = try {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(reactContext)
      } catch (error: UnsupportedOperationException) {
        promise.reject("ON_DEVICE_UNAVAILABLE", error.message, error)
        return@runOnMain
      }
      activeRequestId = requestId
      recognizer = created
      try {
        created.setRecognitionListener(listenerFor(requestId))
        emit(requestId, "listening")
        created.startListening(recognitionIntent(locale))
      } catch (error: Exception) {
        clearActive(requestId, cancel = true)
        throw error
      }
      captureTimeout = Runnable {
        if (activeRequestId == requestId) {
          emitError(requestId, "TIMEOUT")
          clearActive(requestId, cancel = true)
        }
      }.also { mainHandler.postDelayed(it, MAX_CAPTURE_MS) }
      promise.resolve(null)
    }
  }

  override fun stop(requestId: String, promise: Promise) {
    runOnMain(promise) {
      if (activeRequestId != requestId) {
        promise.reject("STALE_REQUEST", "Speech recognition request is no longer active")
        return@runOnMain
      }
      recognizer?.stopListening()
      emit(requestId, "finishing")
      armResultTimeout(requestId)
      promise.resolve(null)
    }
  }

  override fun cancel(requestId: String, promise: Promise) {
    runOnMain(promise) {
      clearActive(requestId, cancel = true)
      promise.resolve(null)
    }
  }

  override fun requestModelDownload(locale: String, promise: Promise) {
    runOnMain(promise) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.reject("DOWNLOAD_UNSUPPORTED", "Speech model downloads require Android 13 or newer")
        return@runOnMain
      }
      if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(reactContext)) {
        promise.reject("ON_DEVICE_UNAVAILABLE", "No on-device speech recognition service is available")
        return@runOnMain
      }
      val probe = try {
        SpeechRecognizer.createOnDeviceSpeechRecognizer(reactContext)
      } catch (error: UnsupportedOperationException) {
        promise.reject("ON_DEVICE_UNAVAILABLE", error.message, error)
        return@runOnMain
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        probe.triggerModelDownload(
          recognitionIntent(locale),
          mainExecutor,
          object : ModelDownloadListener {
            override fun onProgress(completedPercent: Int) = Unit
            override fun onSuccess() {
              probe.destroy()
              promise.resolve("installed")
            }
            override fun onScheduled() {
              probe.destroy()
              promise.resolve("scheduled")
            }
            override fun onError(error: Int) {
              probe.destroy()
              promise.reject("DOWNLOAD_FAILED", "Speech model download failed ($error)")
            }
          }
        )
      } else {
        probe.triggerModelDownload(recognitionIntent(locale))
        probe.destroy()
        promise.resolve("requested")
      }
    }
  }

  private fun listenerFor(requestId: String) = object : RecognitionListener {
    override fun onReadyForSpeech(params: android.os.Bundle?) = emit(requestId, "listening")
    override fun onBeginningOfSpeech() = emit(requestId, "speech")
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() {
      emit(requestId, "finishing")
      armResultTimeout(requestId)
    }

    override fun onError(error: Int) {
      if (activeRequestId != requestId) return
      val code = when (error) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "PERMISSION_DENIED"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "RECOGNIZER_BUSY"
        SpeechRecognizer.ERROR_NO_MATCH -> "NO_MATCH"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "NO_SPEECH"
        SpeechRecognizer.ERROR_AUDIO -> "AUDIO_ERROR"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "UNEXPECTED_NETWORK"
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "LANGUAGE_UNSUPPORTED"
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "LANGUAGE_UNAVAILABLE"
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "PROVIDER_DISCONNECTED"
        else -> "RECOGNITION_FAILED"
      }
      emitError(requestId, code)
      clearActive(requestId, cancel = false)
    }

    override fun onResults(results: android.os.Bundle?) {
      if (activeRequestId != requestId) return
      val values = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      val text = values?.firstOrNull().orEmpty()
      if (text.isBlank()) {
        emitError(requestId, "NO_MATCH")
      } else {
        emit(requestId, "final", text)
      }
      clearActive(requestId, cancel = false)
    }

    override fun onPartialResults(partialResults: android.os.Bundle?) {
      if (activeRequestId != requestId) return
      val text = partialResults
        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        ?.firstOrNull()
        .orEmpty()
      if (text.isNotBlank()) emit(requestId, "partial", text)
    }

    override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit
  }

  private fun recognitionIntent(locale: String) =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }

  private fun capability(
    available: Boolean,
    sdkSupported: Boolean,
    support: String,
    locale: String
  ) = Arguments.createMap().apply {
    putBoolean("available", available)
    putBoolean("sdkSupported", sdkSupported)
    putString("support", support)
    putString("locale", locale)
  }

  private fun emit(requestId: String, type: String, text: String? = null) {
    if (activeRequestId != requestId) return
    val event = Arguments.createMap().apply {
      putString("requestId", requestId)
      putString("type", type)
      if (text != null) putString("text", text)
    }
    sendEvent(event)
  }

  private fun emitError(requestId: String, code: String) {
    if (activeRequestId != requestId) return
    val event = Arguments.createMap().apply {
      putString("requestId", requestId)
      putString("type", "error")
      putString("code", code)
    }
    sendEvent(event)
  }

  private fun sendEvent(event: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, event)
  }

  private fun armResultTimeout(requestId: String) {
    resultTimeout?.let(mainHandler::removeCallbacks)
    resultTimeout = Runnable {
      if (activeRequestId == requestId) {
        emitError(requestId, "RESULT_TIMEOUT")
        clearActive(requestId, cancel = true)
      }
    }.also { mainHandler.postDelayed(it, RESULT_TIMEOUT_MS) }
  }

  private fun clearActive(requestId: String?, cancel: Boolean) {
    if (requestId != null && activeRequestId != requestId) return
    captureTimeout?.let(mainHandler::removeCallbacks)
    resultTimeout?.let(mainHandler::removeCallbacks)
    captureTimeout = null
    resultTimeout = null
    val old = recognizer
    recognizer = null
    activeRequestId = null
    if (cancel) old?.cancel()
    old?.destroy()
  }

  private fun runOnMain(promise: Promise, block: () -> Unit) {
    mainHandler.post {
      try {
        block()
      } catch (error: Exception) {
        promise.reject("SPEECH_RECOGNITION_ERROR", error.message, error)
      }
    }
  }

  override fun onHostResume() = Unit

  override fun onHostPause() {
    mainHandler.post {
      finishTurnCue(false)
      activeRequestId?.let { emit(it, "cancelled") }
      clearActive(null, cancel = true)
    }
  }

  override fun onHostDestroy() {
    mainHandler.post {
      finishTurnCue(false)
      clearActive(null, cancel = true)
    }
  }

  override fun invalidate() {
    reactContext.removeLifecycleEventListener(this)
    mainHandler.post {
      finishTurnCue(false)
      clearActive(null, cancel = true)
    }
    super.invalidate()
  }

  companion object {
    const val EVENT_NAME = "speechRecognitionEvent"
    private const val MAX_CAPTURE_MS = 60_000L
    private const val RESULT_TIMEOUT_MS = 10_000L
    private const val CUE_SAMPLE_RATE = 44_100
    private const val CUE_AMPLITUDE = 0.7
    private const val CUE_FADE_SAMPLES = 220
    private const val CUE_COMPLETION_GRACE_MS = 80L
  }

  private data class CueAudio(val samples: ShortArray, val durationMs: Long)
  private data class ToneSegment(val frequencyHz: Double, val durationMs: Int)
}
