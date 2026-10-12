package com.pocketpal.download

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.sqlite.execSQL
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DownloadMigrationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val path = context.getDatabasePath("migration-test.db")

    @Before
    fun createVersion2Database() {
        path.parentFile!!.mkdirs()
        path.delete()
        val connection = BundledSQLiteDriver().open(path.absolutePath)
        connection.execSQL(
            "CREATE TABLE IF NOT EXISTS `downloads` (`id` TEXT NOT NULL, `url` TEXT NOT NULL, " +
                "`destination` TEXT NOT NULL, `totalBytes` INTEGER NOT NULL, `downloadedBytes` INTEGER NOT NULL, " +
                "`status` TEXT NOT NULL, `priority` INTEGER NOT NULL, `networkType` TEXT NOT NULL, " +
                "`createdAt` INTEGER NOT NULL, `error` TEXT, `authToken` TEXT, PRIMARY KEY(`id`))"
        )
        connection.execSQL(insert("in-flight", "/models/a.gguf", "RUNNING", 1_000, 400, 1))
        connection.execSQL(insert("older", "/models/b.gguf", "RUNNING", 0, 0, 2))
        connection.execSQL(insert("newer", "/models/b.gguf", "QUEUED", 0, 0, 3))
        connection.execSQL("PRAGMA user_version = 2")
        connection.close()
    }

    @After
    fun cleanUp() {
        path.delete()
    }

    @Test
    fun rowsSurviveTheUpgradeWithEmptyValidatorsAndNoPendingFailure() = runBlocking {
        val database = Room.databaseBuilder(context, DownloadDatabase::class.java, path.absolutePath)
            .setDriver(BundledSQLiteDriver())
            .addMigrations(DownloadDatabase.MIGRATION_2_3)
            .build()
        val dao = database.downloadDao()

        val inFlight = dao.getDownload("in-flight")!!
        assertEquals(DownloadStatus.RUNNING, inFlight.status)
        assertEquals(400L, inFlight.downloadedBytes)
        assertEquals(1_000L, inFlight.totalBytes)
        assertNull(inFlight.etag)
        assertEquals(0, inFlight.stalledRuns)
        assertEquals(false, inFlight.failureUnreported)

        val sameDestination = dao.byDestination("/models/b.gguf")
        assertEquals(listOf("newer", "older"), sameDestination.map { it.id })
        sameDestination.forEach {
            assertNull(it.etag)
            assertEquals(0, it.stalledRuns)
            assertEquals(false, it.failureUnreported)
        }
        database.close()
    }

    private fun insert(id: String, destination: String, status: String, total: Long, downloaded: Long, createdAt: Long) =
        "INSERT INTO downloads (id, url, destination, totalBytes, downloadedBytes, status, priority, networkType, createdAt) " +
            "VALUES ('$id', 'https://huggingface.co/x/resolve/main/$id.gguf', '$destination', $total, $downloaded, " +
            "'$status', 0, 'ANY', $createdAt)"
}
