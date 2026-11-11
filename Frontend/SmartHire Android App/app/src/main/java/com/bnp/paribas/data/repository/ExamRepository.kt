package com.bnp.paribas.data.repository

import com.bnp.paribas.core.database.ExamAnswerEntity
import com.bnp.paribas.core.datastore.ExamSession
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.apiCall
import com.bnp.paribas.core.utils.str
import com.bnp.paribas.core.utils.tidyNumber
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.ExamOverview
import com.bnp.paribas.data.models.ExamResult
import com.bnp.paribas.data.models.ExamStart
import com.bnp.paribas.data.models.Mappers
import kotlinx.coroutines.flow.first
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Every /exam endpoint. Uses ONLY the exam session token — never the platform token.
 * Proctor events, /start and /submit are state-changing GETs: never prefetched, never retried.
 */
class ExamRepository {

    private val dao get() = Graph.db.cache()

    /** GET /exam/login — the password lives only in this call and is never stored. */
    suspend fun login(examId: String, email: String, password: String): String {
        val d = apiCall { Graph.api.examLogin(examId, email, password) }
        val token = d.str("session_token")
            ?: throw ApiException(500, "INTERNAL_ERROR", "Unexpected response from server.")
        val id = d.str("exam_id") ?: examId
        Graph.store.saveExamSession(ExamSession(id, token))
        return id
    }

    private suspend fun <T> examAuthed(examId: String, block: suspend (bearer: String) -> T): T {
        val s = Graph.store.examSession.first()
        if (s == null || s.examId != examId) {
            throw ApiException(401, "NOT_AUTHENTICATED", "Your examination session has expired.")
        }
        try {
            return block("Bearer ${s.token}")
        } catch (e: ApiException) {
            // An exam 401 ends only the exam session; the platform session is untouched.
            if (e.status == 401) Graph.store.clearExamSession()
            throw e
        }
    }

    suspend fun overview(examId: String): ExamOverview =
        Mappers.examOverview(examAuthed(examId) { apiCall { Graph.api.exam(it, examId) } }, examId)

    /** Starts or resumes the attempt. Only from an explicit user action. */
    suspend fun start(examId: String): ExamStart =
        Mappers.examStart(examAuthed(examId) { apiCall { Graph.api.examStart(it, examId) } }, examId)

    /** Proctor event. Returns the backend's integrity_score if present. Never retried. */
    suspend fun proctorEvent(
        examId: String,
        type: String,
        timestamp: String,
        duration: Long?,
        details: String?
    ): String? {
        val d = examAuthed(examId) {
            apiCall { Graph.api.proctorEvent(it, examId, type, timestamp, duration, details) }
        }
        return tidyNumber(d.str("integrity_score"))
    }

    /** GET for normal papers, POST when the encoded answers would make the URL too long. */
    suspend fun submit(examId: String, answers: JSONArray) {
        val json = answers.toString()
        val tooLong = java.net.URLEncoder.encode(json, "UTF-8").length > 6000
        examAuthed(examId) { bearer ->
            if (tooLong) {
                val body = JSONObject().put("answers", answers).toString()
                    .toRequestBody("application/json".toMediaType())
                apiCall { Graph.api.examSubmitPost(bearer, examId, body) }
            } else {
                apiCall { Graph.api.examSubmit(bearer, examId, json) }
            }
        }
    }

    suspend fun result(examId: String): ExamResult =
        Mappers.examResult(examAuthed(examId) { apiCall { Graph.api.examResult(it, examId) } })

    // ---- local drafts (keyed by backend question_id) ----
    suspend fun loadDrafts(examId: String): Map<String, String> =
        dao.answers(examId).associate { it.questionId to it.answer }

    suspend fun saveDraft(examId: String, questionId: String, answer: String) {
        dao.putAnswer(ExamAnswerEntity(examId, questionId, answer))
    }

    suspend fun clearDrafts(examId: String) {
        dao.clearAnswers(examId)
    }
}
