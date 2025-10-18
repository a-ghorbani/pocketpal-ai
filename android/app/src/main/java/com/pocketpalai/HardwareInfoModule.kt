package com.pocketpal

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeHardwareInfoSpec
import android.os.Build
import java.io.File
import java.util.regex.Pattern
import android.opengl.GLES20
import javax.microedition.khronos.egl.EGL10
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.egl.EGLContext
import javax.microedition.khronos.egl.EGLDisplay

@ReactModule(name = NativeHardwareInfoSpec.NAME)
class HardwareInfoModule(reactContext: ReactApplicationContext) :
    NativeHardwareInfoSpec(reactContext) {

  override fun getName(): String = NativeHardwareInfoSpec.NAME

  override fun getChipset(promise: Promise) {
    try {
      val chipset = Build.HARDWARE.takeUnless { it.isNullOrEmpty() } ?: Build.BOARD
      promise.resolve(chipset)
    } catch (e: Exception) {
      promise.reject("ERROR", e.message)
    }
  }

  override fun getGPUInfo(promise: Promise) {
    try {
      val gpuInfo = Arguments.createMap()

      // Get GPU renderer info
      var renderer = ""
      var vendor = ""
      var version = ""

      try {
        val egl = EGLContext.getEGL() as EGL10
        val display = egl.eglGetDisplay(EGL10.EGL_DEFAULT_DISPLAY)

        if (display != EGL10.EGL_NO_DISPLAY) {
          val version_array = IntArray(2)
          egl.eglInitialize(display, version_array)

          val configsCount = IntArray(1)
          val configs = arrayOfNulls<EGLConfig>(1)
          val configSpec = intArrayOf(
            EGL10.EGL_RENDERABLE_TYPE, 4,
            EGL10.EGL_NONE
          )

          egl.eglChooseConfig(display, configSpec, configs, 1, configsCount)

          if (configsCount[0] > 0) {
            val context = egl.eglCreateContext(
              display,
              configs[0],
              EGL10.EGL_NO_CONTEXT,
              intArrayOf(0x3098, 2, EGL10.EGL_NONE)
            )

            if (context != null && context != EGL10.EGL_NO_CONTEXT) {
              val surfaceAttribs = intArrayOf(
                EGL10.EGL_WIDTH, 1,
                EGL10.EGL_HEIGHT, 1,
                EGL10.EGL_NONE
              )
              val surface = egl.eglCreatePbufferSurface(display, configs[0], surfaceAttribs)

              if (surface != null && surface != EGL10.EGL_NO_SURFACE) {
                egl.eglMakeCurrent(display, surface, surface, context)

                renderer = GLES20.glGetString(GLES20.GL_RENDERER) ?: ""
                vendor = GLES20.glGetString(GLES20.GL_VENDOR) ?: ""
                version = GLES20.glGetString(GLES20.GL_VERSION) ?: ""

                egl.eglMakeCurrent(display, EGL10.EGL_NO_SURFACE, EGL10.EGL_NO_SURFACE, EGL10.EGL_NO_CONTEXT)
                egl.eglDestroySurface(display, surface)
              }
              egl.eglDestroyContext(display, context)
            }
          }
          egl.eglTerminate(display)
        }
      } catch (e: Exception) {
        // Fallback: GPU info not available
      }

      gpuInfo.putString("renderer", renderer)
      gpuInfo.putString("vendor", vendor)
      gpuInfo.putString("version", version)

      // Detect GPU type based on renderer string
      val rendererLower = renderer.lowercase()
      val hasAdreno = Pattern.compile("(adreno|qcom|qualcomm)").matcher(rendererLower).find()
      val hasMali = Pattern.compile("mali").matcher(rendererLower).find()
      val hasPowerVR = Pattern.compile("powervr").matcher(rendererLower).find()

      gpuInfo.putBoolean("hasAdreno", hasAdreno)
      gpuInfo.putBoolean("hasMali", hasMali)
      gpuInfo.putBoolean("hasPowerVR", hasPowerVR)

      // Note: OpenCL support requires Adreno GPU AND both i8mm and dotprod CPU features
      // This is a requirement from llama.rn builds
      // The actual check is done in JavaScript by combining GPU info with CPU info
      gpuInfo.putBoolean("supportsOpenCL", hasAdreno) // Partial check - CPU features checked separately

      // Determine GPU type string
      val gpuType = when {
        hasAdreno -> "Adreno (Qualcomm)"
        hasMali -> "Mali (ARM)"
        hasPowerVR -> "PowerVR (Imagination)"
        renderer.isNotEmpty() -> renderer
        else -> "Unknown"
      }
      gpuInfo.putString("gpuType", gpuType)

      promise.resolve(gpuInfo)
    } catch (e: Exception) {
      promise.reject("ERROR", e.message)
    }
  }

  override fun getCPUInfo(promise: Promise) {
    try {
      val cpuInfo = Arguments.createMap()
      cpuInfo.putInt("cores", Runtime.getRuntime().availableProcessors())

      val processors = Arguments.createArray()
      val features = mutableSetOf<String>()
      val cpuInfoFile = File("/proc/cpuinfo")

      if (cpuInfoFile.exists()) {
        val cpuInfoLines = cpuInfoFile.readLines()
        var currentProcessor = Arguments.createMap()
        var hasData = false

        for (line in cpuInfoLines) {
          if (line.isEmpty() && hasData) {
            processors.pushMap(currentProcessor)
            currentProcessor = Arguments.createMap()
            hasData = false
            continue
          }

          val parts = line.split(":")
          if (parts.size >= 2) {
            val key = parts[0].trim()
            val value = parts[1].trim()
            when (key) {
              "processor", "model name", "cpu MHz", "vendor_id" -> {
                currentProcessor.putString(key, value)
                hasData = true
              }
              "flags", "Features" -> {  // "flags" for x86, "Features" for ARM
                features.addAll(value.split(" ").filter { it.isNotEmpty() })
              }
            }
          }
        }

        if (hasData) {
          processors.pushMap(currentProcessor)
        }

        cpuInfo.putArray("processors", processors)

        // Convert features set to array
        val featuresArray = Arguments.createArray()
        features.forEach { featuresArray.pushString(it) }
        cpuInfo.putArray("features", featuresArray)

        // ML-related CPU features detection
        cpuInfo.putBoolean("hasFp16", features.any { it in setOf("fphp", "fp16") })
        cpuInfo.putBoolean("hasDotProd", features.any { it in setOf("dotprod", "asimddp") })
        cpuInfo.putBoolean("hasSve", features.any { it == "sve" })
        cpuInfo.putBoolean("hasI8mm", features.any { it == "i8mm" })
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        cpuInfo.putString("socModel", Build.SOC_MODEL)
      }

      promise.resolve(cpuInfo)
    } catch (e: Exception) {
      promise.reject("ERROR", e.message)
    }
  }
}

