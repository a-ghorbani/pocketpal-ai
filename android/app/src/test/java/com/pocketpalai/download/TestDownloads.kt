package com.pocketpal.download

import android.content.Context
import androidx.room.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver

fun inMemoryDatabase(context: Context): DownloadDatabase =
    Room.inMemoryDatabaseBuilder(context, DownloadDatabase::class.java)
        .setDriver(BundledSQLiteDriver())
        .build()

fun downloadRow(
    id: String,
    destination: String,
    status: DownloadStatus = DownloadStatus.QUEUED,
    url: String = "https://huggingface.co/x/resolve/main/model.gguf",
    totalBytes: Long = 0,
    downloadedBytes: Long = 0,
    createdAt: Long = 1,
    etag: String? = null,
    stalledRuns: Int = 0,
) = DownloadEntity(
    id = id,
    url = url,
    destination = destination,
    totalBytes = totalBytes,
    downloadedBytes = downloadedBytes,
    status = status,
    priority = 0,
    networkType = NetworkType.ANY,
    createdAt = createdAt,
    etag = etag,
    stalledRuns = stalledRuns,
)
