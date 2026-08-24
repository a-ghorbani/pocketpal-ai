package com.pocketpal

import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeForegroundServiceSpec

@ReactModule(name = NativeForegroundServiceSpec.NAME)
class ForegroundServiceModule(private val reactContext: ReactApplicationContext) :
    NativeForegroundServiceSpec(reactContext) {

  override fun start(title: String, text: String) {
    val intent =
        Intent(reactContext, AgentRunService::class.java)
            .putExtra(AgentRunService.EXTRA_TITLE, title)
            .putExtra(AgentRunService.EXTRA_TEXT, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
  }

  override fun update(text: String) {
    if (!AgentRunService.running) {
      return
    }
    AgentRunService.currentText = text
    val nm = reactContext.getSystemService(NotificationManager::class.java) ?: return
    nm.notify(
        AgentRunService.NOTIFICATION_ID,
        AgentRunService.buildNotification(reactContext, AgentRunService.currentTitle, text))
  }

  override fun stop() {
    reactContext.stopService(Intent(reactContext, AgentRunService::class.java))
  }
}
