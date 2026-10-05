package com.pocketpal.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import androidx.annotation.RequiresApi
import com.pocketpal.R

@RequiresApi(34)
class DownloadNotifications(private val context: Context) {
    private val launchIntent: PendingIntent? =
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }

    init {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.download_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                )
            )
        }
    }

    fun progress(title: String, percent: Int?): Notification =
        Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, percent ?: 0, percent == null)
            .setContentIntent(launchIntent)
            .build()

    companion object {
        const val CHANNEL_ID = "model_downloads"

        fun percent(downloadedBytes: Long, totalBytes: Long): Int? =
            if (totalBytes > 0) (downloadedBytes * 100 / totalBytes).toInt().coerceIn(0, 100) else null
    }
}
