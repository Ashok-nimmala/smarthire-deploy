package com.bnp.paribas.core.datastore

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** SmartHire platform session (12 hours). The password is never stored. */
data class Session(
    val token: String,
    val userId: String,
    val name: String,
    val email: String,
    val role: String
)

/** Exam session (4 hours). Completely separate from the platform session. */
data class ExamSession(val examId: String, val token: String)

private val Context.platformStore by preferencesDataStore(name = "smarthire_session")
private val Context.examStore by preferencesDataStore(name = "smarthire_exam_session")

class SessionStore(private val ctx: Context) {

    private object K {
        val token = stringPreferencesKey("session_token")
        val userId = stringPreferencesKey("user_id")
        val name = stringPreferencesKey("name")
        val email = stringPreferencesKey("email")
        val role = stringPreferencesKey("role")
        val fcm = stringPreferencesKey("fcm_token")
        val examId = stringPreferencesKey("exam_id")
        val examToken = stringPreferencesKey("exam_session_token")
    }

    val session: Flow<Session?> = ctx.platformStore.data.map { p ->
        val token = p[K.token]
        if (token.isNullOrEmpty()) null
        else Session(
            token = token,
            userId = p[K.userId].orEmpty(),
            name = p[K.name].orEmpty(),
            email = p[K.email].orEmpty(),
            role = p[K.role].orEmpty()
        )
    }

    suspend fun saveSession(s: Session) {
        ctx.platformStore.edit { p ->
            p[K.token] = s.token
            p[K.userId] = s.userId
            p[K.name] = s.name
            p[K.email] = s.email
            p[K.role] = s.role
        }
    }

    /** Logout / expiry: clears the session but keeps device-level values (FCM token, sync times). */
    suspend fun clearSession() {
        ctx.platformStore.edit { p ->
            p.remove(K.token)
            p.remove(K.userId)
            p.remove(K.name)
            p.remove(K.email)
            p.remove(K.role)
        }
    }

    // ---- exam session ----
    val examSession: Flow<ExamSession?> = ctx.examStore.data.map { p ->
        val id = p[K.examId]
        val token = p[K.examToken]
        if (id.isNullOrEmpty() || token.isNullOrEmpty()) null else ExamSession(id, token)
    }

    suspend fun saveExamSession(s: ExamSession) {
        ctx.examStore.edit { p ->
            p[K.examId] = s.examId
            p[K.examToken] = s.token
        }
    }

    suspend fun clearExamSession() {
        ctx.examStore.edit { it.clear() }
    }

    // ---- FCM token (stored locally only; the backend has no registration endpoint) ----
    suspend fun saveFcmToken(token: String) {
        ctx.platformStore.edit { it[K.fcm] = token }
    }

    // ---- last synchronisation times ----
    suspend fun setLastSync(key: String, epochMs: Long) {
        ctx.platformStore.edit { it[longPreferencesKey("sync_$key")] = epochMs }
    }

    suspend fun lastSync(key: String): Long? =
        ctx.platformStore.data.first()[longPreferencesKey("sync_$key")]
}
