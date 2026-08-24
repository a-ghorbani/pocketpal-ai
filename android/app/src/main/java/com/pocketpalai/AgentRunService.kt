package com.pocketpal

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the process alive while a model run is in
 * progress, so a multi-step tool loop survives the app being backgrounded
 * or the screen turning off. The JS side drives it through
 * ForegroundServiceModule; this class owns the notification itself.
 */
class AgentRunService : Service() {

  companion object {
    const val CHANNEL_ID = "agent_run"
    const val NOTIFICATION_ID = 0x4147
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"

    /** Set by the service lifecycle; lets update()/stop() no-op safely. */
    @Volatile var running: Boolean = false
      private set

    @Volatile var currentTitle: String = ""
    @Volatile var currentText: String = ""

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return
      }
      val nm = context.getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) != null) {
        return
      }
      val channel =
          NotificationChannel(
              CHANNEL_ID,
              "Model runs",
              NotificationManager.IMPORTANCE_LOW)
      channel.description = "Progress of an in-progress model run"
      channel.setShowBadge(false)
      nm.createNotificationChannel(channel)
    }

    fun buildNotification(context: Context, title: String, text: String): Notification {
      ensureChannel(context)
      val contentIntent =
          PendingIntent.getActivity(
              context,
              0,
              Intent(context, MainActivity::class.java)
                  .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      return NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(R.drawable.ic_stat_agent)
          .setContentTitle(title)
          .setContentText(text)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setContentIntent(contentIntent)
          .setCategory(NotificationCompat.CATEGORY_PROGRESS)
          .build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: currentTitle
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: currentText
    currentTitle = title
    currentText = text
    val notification = buildNotification(this, title, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    running = true
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The user swiped the task away: the JS runtime is gone and the run
    // is dead. Drop the notification instead of advertising a ghost run.
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }
}
