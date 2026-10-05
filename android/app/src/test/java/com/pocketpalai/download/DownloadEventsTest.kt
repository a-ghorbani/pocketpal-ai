package com.pocketpal.download

import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadEventsTest {
    private fun row(status: DownloadStatus, error: String? = null) =
        downloadRow("a", "/m/a.gguf", status, totalBytes = 1_000, downloadedBytes = 250).copy(error = error)

    @Test
    fun eachStatusMapsToItsEventAndObservationEnd() {
        val table = listOf(
            Triple(DownloadStatus.QUEUED, null, false),
            Triple(DownloadStatus.RUNNING, RowEvent.Progress(250, 1_000), false),
            Triple(DownloadStatus.PAUSED, null, false),
            Triple(DownloadStatus.COMPLETED, RowEvent.Completed("/m/a.gguf"), true),
            Triple(DownloadStatus.FAILED, RowEvent.Failed("boom", 25.0), true),
            Triple(DownloadStatus.CANCELLED, null, true),
        )
        assertEquals(DownloadStatus.entries.toSet(), table.map { it.first }.toSet())

        for ((status, event, ends) in table) {
            val row = row(status, error = "boom".takeIf { status == DownloadStatus.FAILED })
            assertEquals("$status event", event, row.event())
            assertEquals("$status ends observation", ends, status.endsObservation)
        }
    }

    @Test
    fun failureWithoutAMessageStillReportsOne() {
        assertEquals(RowEvent.Failed("Unknown error", 25.0), row(DownloadStatus.FAILED).event())
    }

    @Test
    fun percentOfAnUnknownTotalIsZero() {
        assertEquals(0.0, percent(250, 0), 0.0)
    }
}
