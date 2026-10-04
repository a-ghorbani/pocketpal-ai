package com.pocketpal.download

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.execSQL

@Database(
    entities = [DownloadEntity::class],
    version = 3,
    exportSchema = false
)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao

    companion object {
        private const val DATABASE_NAME = "downloads.db"

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE downloads ADD COLUMN authToken TEXT")
            }
        }

        private val MIGRATION_2_3_SQL = listOf(
            "ALTER TABLE downloads ADD COLUMN etag TEXT",
            "ALTER TABLE downloads ADD COLUMN stalledRuns INTEGER NOT NULL DEFAULT 0",
        )

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                MIGRATION_2_3_SQL.forEach(database::execSQL)
            }

            override fun migrate(connection: SQLiteConnection) {
                MIGRATION_2_3_SQL.forEach(connection::execSQL)
            }
        }

        @Volatile
        private var INSTANCE: DownloadDatabase? = null

        fun getInstance(context: Context): DownloadDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    DownloadDatabase::class.java,
                    DATABASE_NAME
                )
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()
                .also { INSTANCE = it }
            }
        }
    }
} 