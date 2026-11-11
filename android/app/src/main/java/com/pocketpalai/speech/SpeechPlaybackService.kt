package com.pocketpal.speech

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.pocketpal.R

/**
 * Keeps the process in the foreground scheduling group while PocketPal speaks,
 * so neural synthesis keeps pace with playback when the screen is off.
 */
class SpeechPlaybackService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = notification(SpeechPlayback.copy)
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } catch (e: Exception) {
            Log.w(TAG, "startForeground refused", e)
            SpeechPlayback.controller.onForegroundFailed()
            stopSelf()
            return START_NOT_STICKY
        }
        SpeechPlayback.controller.onForegroundStarted()
        return START_NOT_STICKY
    }

    private fun notification(copy: SpeechPlaybackCopy): Notification {
        val appName = getString(R.string.app_name)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    copy.channelName.ifBlank { appName },
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
        val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(copy.title.ifBlank { appName })
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    companion object {
        private const val TAG = "SpeechPlaybackService"
        private const val CHANNEL_ID = "speech_playback"
        private const val NOTIFICATION_ID = 1
    }
}
