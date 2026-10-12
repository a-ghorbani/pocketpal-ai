package com.pocketpal.download

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadRunsTest {
    private val runs = DownloadRuns()

    @Test
    fun overlappingRunsOfOneIdKeepTheirOwnSignals() {
        val first = runs.register("a")
        val second = runs.register("a")

        runs.unregister("a", first)

        assertTrue(runs.isActive("a"))
        runs.stop("a")
        assertTrue(second.stopped)
        assertFalse(second.userStop)
        assertFalse(first.stopped)
    }

    @Test
    fun userStopStaysOnItsOwnInstance() {
        val first = runs.register("a")
        val second = runs.register("a")

        first.stop(user = true)

        assertTrue(first.userStop)
        assertFalse(second.userStop)
        assertFalse(second.stopped)
    }

    @Test
    fun lastUnregisterEndsActivity() {
        val signal = runs.register("a")

        runs.unregister("a", signal)

        assertFalse(runs.isActive("a"))
    }
}
