package com.pocketpal

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
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
  private var cueGenerator: ToneGenerator? = null
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
      val toneType: Int
      val durationMs: Int
      when (cue) {
        "narrationEnded" -> {
          toneType = ToneGenerator.TONE_PROP_PROMPT
          durationMs = 200
        }
        "listeningEnded" -> {
          toneType = ToneGenerator.TONE_PROP_BEEP2
          durationMs = 270
        }
        else -> {
          promise.reject("INVALID_CUE", "Unknown conversation turn cue")
          return@runOnMain
        }
      }
      val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val notifications = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val keyguard = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (
        activeRequestId != null ||
        !reactContext.hasCurrentActivity() ||
        reactContext.lifecycleState != LifecycleState.RESUMED ||
        keyguard.isDeviceLocked ||
        audio.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
        audio.isStreamMute(AudioManager.STREAM_MUSIC) ||
        audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0 ||
        notifications.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL
      ) {
        promise.resolve(false)
        return@runOnMain
      }
      finishTurnCue(false)
      val generator = ToneGenerator(AudioManager.STREAM_MUSIC, 45)
      if (!generator.startTone(toneType, durationMs)) {
        generator.release()
        promise.reject("CUE_PLAYBACK_FAILED", "Unable to start conversation turn cue")
        return@runOnMain
      }
      cueGenerator = generator
      cuePromise = promise
      cueCompletion = Runnable { finishTurnCue(true) }.also {
        mainHandler.postDelayed(it, durationMs + 40L)
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
    cueGenerator?.stopTone()
    cueGenerator?.release()
    cueGenerator = null
    cuePromise?.resolve(completed)
    cuePromise = null
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
  }
}
