package com.pocketpal.speech

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The notification's Stop. A broadcast, so a late tap never starts the service. */
class SpeechPlaybackStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        SpeechPlayback.requestStop()
    }
}
