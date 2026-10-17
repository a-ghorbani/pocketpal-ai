package com.pocketpal.download

import android.app.job.JobParameters
import com.pocketpal.download.DownloadJobService.StopKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadJobServiceTest {
    @Test
    fun stopReasonsMapToStopKinds() {
        assertEquals(StopKind.APP, DownloadJobService.stopKind(JobParameters.STOP_REASON_CANCELLED_BY_APP))
        assertEquals(StopKind.USER, DownloadJobService.stopKind(JobParameters.STOP_REASON_USER))
        listOf(
            JobParameters.STOP_REASON_CONSTRAINT_CONNECTIVITY,
            JobParameters.STOP_REASON_DEVICE_STATE,
            JobParameters.STOP_REASON_TIMEOUT,
            JobParameters.STOP_REASON_QUOTA,
            JobParameters.STOP_REASON_UNDEFINED,
        ).forEach { assertEquals(StopKind.SYSTEM, DownloadJobService.stopKind(it)) }
    }

    @Test
    fun onlySystemStopsReschedule() {
        assertTrue(DownloadJobService.reschedules(StopKind.SYSTEM))
        assertFalse(DownloadJobService.reschedules(StopKind.USER))
        assertFalse(DownloadJobService.reschedules(StopKind.APP))
    }
}
