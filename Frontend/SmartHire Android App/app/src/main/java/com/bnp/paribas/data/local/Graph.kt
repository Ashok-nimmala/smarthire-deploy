package com.bnp.paribas.data.local

import android.app.Application
import androidx.room.Room
import com.bnp.paribas.core.database.AppDatabase
import com.bnp.paribas.core.datastore.SessionStore
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.Net
import com.bnp.paribas.data.api.SmartHireApi
import com.bnp.paribas.data.repository.ApplicationRepository
import com.bnp.paribas.data.repository.AuthRepository
import com.bnp.paribas.data.repository.CandidateRepository
import com.bnp.paribas.data.repository.ExamRepository
import com.bnp.paribas.data.repository.JobRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

/** Tiny service locator. Kept simple on purpose (no DI framework). */
object Graph {
    private lateinit var app: Application

    fun init(application: Application) {
        app = application
    }

    val context: Application get() = app

    val store: SessionStore by lazy { SessionStore(app) }

    val db: AppDatabase by lazy {
        Room.databaseBuilder(app, AppDatabase::class.java, "smarthire.db")
            .fallbackToDestructiveMigration()
            .build()
    }

    val api: SmartHireApi get() = Net.api

    val auth: AuthRepository by lazy { AuthRepository() }
    val candidate: CandidateRepository by lazy { CandidateRepository() }
    val jobs: JobRepository by lazy { JobRepository() }
    val applications: ApplicationRepository by lazy { ApplicationRepository() }
    val exams: ExamRepository by lazy { ExamRepository() }

    /**
     * Runs an authenticated platform call. On 401 the local session and all cached
     * (sensitive) data are cleared; the navigation layer then sends the user to Login.
     */
    suspend fun <T> authed(block: suspend (bearer: String) -> T): T {
        val s = store.session.first()
            ?: throw ApiException(401, "NOT_AUTHENTICATED", "Please sign in.")
        try {
            return block("Bearer ${s.token}")
        } catch (e: ApiException) {
            if (e.status == 401) clearEverything()
            throw e
        }
    }

    suspend fun clearEverything() {
        store.clearSession()
        store.clearExamSession()
        withContext(Dispatchers.IO) { db.clearAllTables() }
    }
}
