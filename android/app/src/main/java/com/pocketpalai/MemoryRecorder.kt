package com.pocketpal

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import android.os.SystemClock
import java.io.File
import java.io.FileOutputStream

// Spike: a flight recorder for memory signals. A plain write(2) per line reaches the page cache,
// so the last sample before an lmkd kill survives the process.
object MemoryRecorder {
  @Volatile private var label: String = "start"
  private var out: FileOutputStream? = null
  private var thread: Thread? = null
  private var path: String = ""
  private val lock = Any()

  fun start(context: Context, intervalMs: Long): String {
    synchronized(lock) {
      if (thread != null) return path
      val dir = context.getExternalFilesDir(null) ?: context.filesDir
      val file = File(dir, "memrec-${System.currentTimeMillis()}.tsv")
      path = file.absolutePath
      out = FileOutputStream(file, true)
      write(
        "wall_ms\tup_ms\tlabel\trss_kb\tswap_kb\tanon_kb\tfile_kb\tmem_avail_kb\tmem_free_kb\tswap_free_kb\tam_avail_kb\tam_threshold_kb\tlow_memory\tnative_alloc_kb\n",
      )
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      thread = Thread({
        while (true) {
          sample(am)
          try {
            Thread.sleep(intervalMs)
          } catch (e: InterruptedException) {
            return@Thread
          }
        }
      }, "MemoryRecorder").apply {
        isDaemon = true
        start()
      }
      return path
    }
  }

  fun mark(context: Context, newLabel: String) {
    label = newLabel.replace('\t', ' ').replace('\n', ' ')
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    sample(am)
  }

  fun signals(context: Context): LongArray {
    val status = readKb("/proc/self/status", arrayOf("VmRSS", "VmSwap"))
    val meminfo = readKb("/proc/meminfo", arrayOf("MemAvailable"))
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    return longArrayOf(status[0], status[1], meminfo[0], if (info.lowMemory) 1 else 0)
  }

  private fun sample(am: ActivityManager) {
    val status = readKb("/proc/self/status", arrayOf("VmRSS", "VmSwap", "RssAnon", "RssFile"))
    val meminfo = readKb("/proc/meminfo", arrayOf("MemAvailable", "MemFree", "SwapFree"))
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    val line = listOf(
      System.currentTimeMillis(),
      SystemClock.uptimeMillis(),
      label,
      status[0], status[1], status[2], status[3],
      meminfo[0], meminfo[1], meminfo[2],
      info.availMem / 1024, info.threshold / 1024, if (info.lowMemory) 1 else 0,
      Debug.getNativeHeapAllocatedSize() / 1024,
    ).joinToString("\t") + "\n"
    write(line)
  }

  private fun write(line: String) {
    synchronized(lock) {
      try {
        out?.write(line.toByteArray())
      } catch (_: Exception) {
      }
    }
  }

  private fun readKb(path: String, keys: Array<String>): LongArray {
    val values = LongArray(keys.size) { -1 }
    try {
      File(path).forEachLine { l ->
        val i = keys.indexOfFirst { l.startsWith("$it:") }
        if (i >= 0) values[i] = l.substringAfter(':').trim().split(' ')[0].toLongOrNull() ?: -1
      }
    } catch (_: Exception) {
    }
    return values
  }
}
