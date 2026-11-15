package com.pocketpal.speech

import com.pocketpal.speech.SpeechPlaybackController.State
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpeechPlaybackControllerTest {
    private class FakePort : SpeechPlaybackController.Port {
        var starts = 0
        var stops = 0
        var refuseStart = false
        var scheduledDelay: Long? = null
        private var scheduled: (() -> Unit)? = null

        override fun startService() {
            if (refuseStart) throw IllegalStateException("refused")
            starts++
        }

        override fun stopService() {
            stops++
        }

        override fun schedule(delayMs: Long, action: () -> Unit) {
            scheduledDelay = delayMs
            scheduled = action
        }

        override fun cancelScheduled() {
            scheduledDelay = null
            scheduled = null
        }

        fun runScheduled() {
            val action = scheduled
            scheduled = null
            scheduledDelay = null
            action?.invoke()
        }
    }

    private val port = FakePort()
    private val controller = SpeechPlaybackController(port)

    private fun foreground() {
        controller.start()
        controller.onForegroundStarted()
    }

    @Test
    fun `start from none starts the service once`() {
        controller.start()
        controller.start()

        assertEquals(State.STARTING, controller.state)
        assertEquals(1, port.starts)
    }

    @Test
    fun `a refused start throws and leaves none so the next start retries`() {
        port.refuseStart = true
        val thrown = runCatching { controller.start() }.exceptionOrNull()

        assertEquals("refused", thrown?.message)
        assertEquals(State.NONE, controller.state)

        port.refuseStart = false
        controller.start()
        assertEquals(State.STARTING, controller.state)
    }

    @Test
    fun `stop while starting waits for startForeground, then lingers`() {
        controller.start()
        controller.stop()

        assertEquals(State.STARTING_STOP_PENDING, controller.state)
        assertNull(port.scheduledDelay)
        assertEquals(0, port.stops)

        controller.onForegroundStarted()
        assertEquals(State.LINGERING, controller.state)
        assertEquals(SpeechPlaybackController.LINGER_MS, port.scheduledDelay)

        port.runScheduled()
        assertEquals(State.NONE, controller.state)
        assertEquals(1, port.stops)
    }

    @Test
    fun `start while a stop is pending keeps the service`() {
        controller.start()
        controller.stop()
        controller.start()
        controller.onForegroundStarted()

        assertEquals(State.FOREGROUND, controller.state)
        assertEquals(1, port.starts)
        assertNull(port.scheduledDelay)
    }

    @Test
    fun `a startForeground failure returns to none from either starting state`() {
        controller.start()
        controller.onForegroundFailed()
        assertEquals(State.NONE, controller.state)

        controller.start()
        controller.stop()
        controller.onForegroundFailed()
        assertEquals(State.NONE, controller.state)
        assertEquals(0, port.stops)
    }

    @Test
    fun `stop in foreground lingers, then stops the service`() {
        foreground()
        controller.stop()

        assertEquals(State.LINGERING, controller.state)
        port.runScheduled()
        assertEquals(State.NONE, controller.state)
        assertEquals(1, port.stops)
    }

    @Test
    fun `start while lingering cancels the linger and keeps the service`() {
        foreground()
        controller.stop()
        controller.start()

        assertEquals(State.FOREGROUND, controller.state)
        assertNull(port.scheduledDelay)
        assertEquals(1, port.starts)
        assertEquals(0, port.stops)
    }

    @Test
    fun `stop while lingering does not reset the timer`() {
        foreground()
        controller.stop()
        port.scheduledDelay = null
        controller.stop(lingerMs = 0)

        assertEquals(State.LINGERING, controller.state)
        assertNull(port.scheduledDelay)
    }

    @Test
    fun `a zero linger stop passes its delay through a pending start`() {
        controller.start()
        controller.stop(lingerMs = 0)
        controller.onForegroundStarted()

        assertEquals(0L, port.scheduledDelay)
    }

    @Test
    fun `stop with nothing running does nothing`() {
        controller.stop()

        assertEquals(State.NONE, controller.state)
        assertEquals(0, port.stops)
        assertNull(port.scheduledDelay)
    }
}
