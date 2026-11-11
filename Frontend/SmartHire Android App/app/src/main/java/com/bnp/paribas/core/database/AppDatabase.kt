package com.bnp.paribas.core.database

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/*
 * The cache stores the backend's own JSON for each record and maps it on read, so the UI
 * always shows exactly what the API returned (never fabricated data). See data/models/Mappers.kt.
 */

@Entity(tableName = "dashboard")
data class DashboardEntity(@PrimaryKey val id: Int = 0, val json: String, val updatedAt: Long)

@Entity(tableName = "profile")
data class ProfileEntity(@PrimaryKey val id: Int = 0, val json: String, val updatedAt: Long)

@Entity(tableName = "jobs")
data class JobEntity(@PrimaryKey val jdId: String, val json: String, val sortIndex: Int)

@Entity(tableName = "applications")
data class ApplicationEntity(@PrimaryKey val appId: String, val json: String, val sortIndex: Int)

/** Draft answers for an active exam, keyed by the backend's question_id. */
@Entity(tableName = "exam_answers", primaryKeys = ["examId", "questionId"])
data class ExamAnswerEntity(val examId: String, val questionId: String, val answer: String)

@Dao
abstract class CacheDao {

    // ---- dashboard ----
    @Query("SELECT * FROM dashboard WHERE id = 0")
    abstract fun dashboard(): Flow<DashboardEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putDashboard(e: DashboardEntity)

    // ---- profile ----
    @Query("SELECT * FROM profile WHERE id = 0")
    abstract fun profile(): Flow<ProfileEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putProfile(e: ProfileEntity)

    // ---- jobs ----
    @Query("SELECT * FROM jobs ORDER BY sortIndex ASC")
    abstract fun jobs(): Flow<List<JobEntity>>

    @Query("SELECT * FROM jobs WHERE jdId = :id")
    abstract fun job(id: String): Flow<JobEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putJobs(list: List<JobEntity>)

    @Query("DELETE FROM jobs")
    abstract suspend fun clearJobs()

    @Query("UPDATE jobs SET json = :json WHERE jdId = :id")
    abstract suspend fun updateJobJson(id: String, json: String): Int

    @Transaction
    open suspend fun replaceJobs(list: List<JobEntity>) {
        clearJobs()
        putJobs(list)
    }

    @Transaction
    open suspend fun upsertJobDetail(id: String, json: String) {
        if (updateJobJson(id, json) == 0) putJobs(listOf(JobEntity(id, json, 9999)))
    }

    // ---- applications ----
    @Query("SELECT * FROM applications ORDER BY sortIndex ASC")
    abstract fun applications(): Flow<List<ApplicationEntity>>

    @Query("SELECT * FROM applications WHERE appId = :id")
    abstract fun application(id: String): Flow<ApplicationEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putApplications(list: List<ApplicationEntity>)

    @Query("DELETE FROM applications")
    abstract suspend fun clearApplications()

    @Query("UPDATE applications SET json = :json WHERE appId = :id")
    abstract suspend fun updateApplicationJson(id: String, json: String): Int

    @Transaction
    open suspend fun replaceApplications(list: List<ApplicationEntity>) {
        clearApplications()
        putApplications(list)
    }

    @Transaction
    open suspend fun upsertApplicationDetail(id: String, json: String) {
        if (updateApplicationJson(id, json) == 0) putApplications(listOf(ApplicationEntity(id, json, 9999)))
    }

    // ---- exam drafts ----
    @Query("SELECT * FROM exam_answers WHERE examId = :examId")
    abstract suspend fun answers(examId: String): List<ExamAnswerEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun putAnswer(e: ExamAnswerEntity)

    @Query("DELETE FROM exam_answers WHERE examId = :examId")
    abstract suspend fun clearAnswers(examId: String)
}

@Database(
    entities = [
        DashboardEntity::class,
        ProfileEntity::class,
        JobEntity::class,
        ApplicationEntity::class,
        ExamAnswerEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao
}
