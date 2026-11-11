package com.bnp.paribas.features.exam

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.ExamOverview
import com.bnp.paribas.data.models.ExamQuestion
import com.bnp.paribas.data.models.ExamResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

// ============================================================ exam login

data class ExamLoginUi(
    val email: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val done: Boolean = false
)

class ExamLoginViewModel(handle: SavedStateHandle) : ViewModel() {
    val examId: String = handle.get<String>("examId").orEmpty()

    private val _ui = MutableStateFlow(ExamLoginUi())
    val ui: StateFlow<ExamLoginUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            val email = Graph.store.session.first()?.email.orEmpty()
            _ui.update { it.copy(email = email) }
        }
    }

    fun onEmailChange(v: String) = _ui.update { it.copy(email = v) }

    /** Exam login is a separate session (4 h). The password is used once and never stored. */
    fun submit(password: String) {
        val s = _ui.value
        if (s.busy) return
        val email = s.email.trim()
        if (examId.isBlank()) { _ui.update { it.copy(error = "Please enter your Exam ID.") }; return }
        if (email.isEmpty()) { _ui.update { it.copy(error = "Please enter your email.") }; return }
        if (password.isEmpty()) { _ui.update { it.copy(error = "Please enter your password.") }; return }

        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                Graph.exams.login(examId, email, password)
                _ui.update { it.copy(busy = false, done = true) }
            } catch (e: ApiException) {
                _ui.update { it.copy(busy = false, error = message(e)) }
            }
        }
    }

    private fun message(e: ApiException): String {
        val text = (e.code.orEmpty() + " " + e.message).lowercase()
        return when (e.status) {
            401 -> "Incorrect email or password."
            404 -> "Invalid Exam ID or examination not found."
            403 -> when {
                text.contains("closed") -> "This examination is no longer available."
                text.contains("eligib") -> "You are not eligible for this examination yet."
                else -> ErrorMapper.userMessage(e)
            }
            409 -> "This examination has already been submitted."
            429 -> "Too many attempts. Please try again later."
            else -> ErrorMapper.userMessage(e)
        }
    }
}

// ============================================================ exam

enum class ExamStage { LOADING, OVERVIEW, STARTING, ACTIVE, SUBMITTING, ERROR }

data class ExamUi(
    val stage: ExamStage = ExamStage.LOADING,
    val overview: ExamOverview? = null,
    val note: String? = null,
    val error: String? = null,

    // active exam
    val jobTitle: String = "",
    val examIdShown: String = "",
    val showIdPopup: Boolean = false,
    val questions: List<ExamQuestion> = emptyList(),
    val current: Int = 0,
    val answers: Map<String, String> = emptyMap(),
    val integrity: String? = null,
    val hasTimer: Boolean = false,
    val remainingMs: Long = 0L,
    val showConfirm: Boolean = false,
    val toast: String? = null,

    // one-shot navigation flags
    val submitted: Boolean = false,
    val sessionExpired: Boolean = false
)

class ExamViewModel(handle: SavedStateHandle) : ViewModel() {
    val examId: String = handle.get<String>("examId").orEmpty()

    private val _ui = MutableStateFlow(ExamUi())
    val ui: StateFlow<ExamUi> = _ui.asStateFlow()

    private var submitting = false // duplicate-submission guard
    private var deadlineMs: Long? = null
    private var timerJob: Job? = null
    private var draftJob: Job? = null

    private val proctor = ProctorManager(
        context = Graph.context,
        scope = viewModelScope,
        send = { type, ts, dur, det -> Graph.exams.proctorEvent(examId, type, ts, dur, det) },
        onScore = { score -> _ui.update { it.copy(integrity = score) } }, // backend is authoritative
        onRecorded = { _ui.update { it.copy(toast = "⚠ Proctoring event recorded") } },
        onExpired = { expire() }
    )

    init {
        load()
    }

    // ---------------------------------------------------------- overview

    fun load() {
        _ui.update { it.copy(stage = ExamStage.LOADING, error = null) }
        viewModelScope.launch {
            try {
                val ov = Graph.exams.overview(examId)
                if (ov.submitted) {
                    _ui.update { it.copy(overview = ov, submitted = true) }
                    return@launch
                }
                _ui.update {
                    it.copy(stage = ExamStage.OVERVIEW, overview = ov, integrity = ov.integrity, jobTitle = ov.jobTitle)
                }
            } catch (e: ApiException) {
                if (e.isUnauthorized) expire()
                else _ui.update { it.copy(stage = ExamStage.ERROR, error = ErrorMapper.userMessage(e)) }
            }
        }
    }

    // ---------------------------------------------------------- start / resume (explicit user action)

    fun start() {
        val ov = _ui.value.overview ?: return
        if (_ui.value.stage != ExamStage.OVERVIEW) return
        if (!ov.canStart && !ov.started) return

        _ui.update { it.copy(stage = ExamStage.STARTING, note = null) }
        viewModelScope.launch {
            try {
                val s = Graph.exams.start(examId)
                if (s.questions.isEmpty()) {
                    _ui.update { it.copy(stage = ExamStage.ERROR, error = "No questions were returned for this examination.") }
                    return@launch
                }
                val drafts = Graph.exams.loadDrafts(examId)
                val answers = s.questions.associate { q -> q.id to (drafts[q.id] ?: "") }

                deadlineMs = s.deadlineMs
                submitting = false
                _ui.update {
                    it.copy(
                        stage = ExamStage.ACTIVE,
                        jobTitle = s.jobTitle ?: it.jobTitle,
                        examIdShown = s.examId,           // the real exam id from the backend
                        showIdPopup = true,               // shown before any question is visible
                        questions = s.questions,
                        current = 0,
                        answers = answers,
                        integrity = s.integrity ?: it.integrity,
                        hasTimer = s.deadlineMs != null,
                        showConfirm = false
                    )
                }
                startTimer()
            } catch (e: ApiException) {
                when {
                    e.isUnauthorized -> expire()
                    e.status == 409 -> _ui.update { it.copy(submitted = true) }
                    else -> _ui.update { it.copy(stage = ExamStage.OVERVIEW, note = ErrorMapper.userMessage(e)) }
                }
            }
        }
    }

    /** "Continue to Exam" on the ID popup. Proctoring begins only now (after the ID has been copied). */
    fun continueToExam() {
        if (!_ui.value.showIdPopup) return
        _ui.update { it.copy(showIdPopup = false) }
        proctor.start()
    }

    fun onIdCopied() {
        _ui.update { it.copy(toast = "Exam ID copied") }
    }

    // ---------------------------------------------------------- answering

    fun goTo(i: Int) {
        if (submitting) return
        _ui.update { if (i in it.questions.indices) it.copy(current = i) else it }
    }

    fun onAnswerChanged(text: String) {
        if (submitting) return
        val s = _ui.value
        val q = s.questions.getOrNull(s.current) ?: return
        val old = s.answers[q.id].orEmpty()

        // A single edit that inserts a large block of text is reported as a paste.
        if (proctorActive() && text.length - old.length > PASTE_THRESHOLD) proctor.report("paste")

        _ui.update { it.copy(answers = it.answers + (q.id to text)) }

        draftJob?.cancel()
        draftJob = viewModelScope.launch {
            delay(400)
            Graph.exams.saveDraft(examId, q.id, text)
        }
    }

    private fun proctorActive(): Boolean {
        val s = _ui.value
        return s.stage == ExamStage.ACTIVE && !s.showIdPopup
    }

    /** The app left the foreground (equivalent of a browser tab switch). */
    fun onBackgrounded() {
        if (proctorActive() && !submitting) proctor.report("tab_switch")
    }

    // ---------------------------------------------------------- timer (backend timing only)

    private fun startTimer() {
        timerJob?.cancel()
        val dl = deadlineMs ?: return
        timerJob = viewModelScope.launch {
            while (isActive) {
                val left = dl - System.currentTimeMillis()
                _ui.update { it.copy(remainingMs = left.coerceAtLeast(0L)) }
                if (left <= 0L) {
                    submit(auto = true)
                    break
                }
                delay(1000)
            }
        }
    }

    // ---------------------------------------------------------- submit

    fun requestSubmit() {
        if (submitting || _ui.value.stage != ExamStage.ACTIVE || _ui.value.showIdPopup) return
        _ui.update { it.copy(showConfirm = true) }
    }

    fun cancelSubmit() {
        _ui.update { it.copy(showConfirm = false) }
    }

    fun confirmSubmit() = submit(auto = false)

    private fun submit(auto: Boolean) {
        if (submitting) return
        if (_ui.value.stage != ExamStage.ACTIVE) return
        submitting = true

        timerJob?.cancel()
        proctor.stop()
        _ui.update { it.copy(stage = ExamStage.SUBMITTING, showConfirm = false, showIdPopup = false) }

        viewModelScope.launch {
            val s = _ui.value
            val rows = JSONArray()
            for (q in s.questions) { // every question gets a row; unanswered => ""
                rows.put(JSONObject().put("question_id", q.id).put("answer", s.answers[q.id].orEmpty()))
            }
            try {
                Graph.exams.submit(examId, rows)
                finishSubmitted()
            } catch (e: ApiException) {
                when {
                    e.isUnauthorized -> expire()
                    e.status == 409 -> finishSubmitted() // already submitted: backend treats it as a no-op
                    else -> {
                        // Not retried automatically. Return to the paper so the candidate can decide.
                        submitting = false
                        _ui.update {
                            it.copy(
                                stage = ExamStage.ACTIVE,
                                toast = "Submission failed: " + ErrorMapper.userMessage(e)
                            )
                        }
                        proctor.start()
                        // Never loop into another automatic submit: only resume the countdown if time remains.
                        val left = deadlineMs?.let { it - System.currentTimeMillis() }
                        if (left != null && left > 0L) startTimer()
                        else if (left != null) _ui.update { it.copy(remainingMs = 0L) }
                    }
                }
            }
        }
    }

    private suspend fun finishSubmitted() {
        Graph.exams.clearDrafts(examId)
        _ui.update { it.copy(submitted = true) }
    }

    // ---------------------------------------------------------- leave / expiry

    /** Candidate confirmed "Leave". Nothing is submitted; drafts stay saved locally. */
    fun leave() {
        timerJob?.cancel()
        proctor.stop()
    }

    private fun expire() {
        submitting = true
        timerJob?.cancel()
        proctor.stop()
        _ui.update { it.copy(sessionExpired = true) }
    }

    fun consumeToast() {
        _ui.update { it.copy(toast = null) }
    }

    override fun onCleared() {
        proctor.stop()
        super.onCleared()
    }

    private companion object {
        const val PASTE_THRESHOLD = 25
    }
}

// ============================================================ exam result

data class ExamResultUi(
    val result: ExamResult? = null,
    val note: String? = null,
    val error: String? = null,
    val expired: Boolean = false
)

class ExamResultViewModel(handle: SavedStateHandle) : ViewModel() {
    private val examId: String = handle.get<String>("examId").orEmpty()

    private val _ui = MutableStateFlow(ExamResultUi())
    val ui: StateFlow<ExamResultUi> = _ui.asStateFlow()

    private var polling: Job? = null

    /** Polls every 5 s until scored == true. Cancelled when the screen leaves the foreground. */
    fun startPolling() {
        if (polling?.isActive == true || _ui.value.result?.scored == true) return
        polling = viewModelScope.launch {
            while (isActive) {
                try {
                    val r = Graph.exams.result(examId)
                    if (r.scored) {
                        _ui.update { it.copy(result = r, note = null, error = null) }
                        Graph.store.clearExamSession() // exam is over; drop the exam token
                        break
                    }
                    _ui.update { it.copy(note = null) }
                } catch (e: ApiException) {
                    when {
                        e.isUnauthorized -> {
                            _ui.update { it.copy(expired = true, error = "Your examination session has expired.") }
                            break
                        }
                        e.isOffline || e.status == 429 || e.status >= 500 ->
                            _ui.update { it.copy(note = "Still working… reconnecting.") }
                        else -> {
                            _ui.update { it.copy(error = ErrorMapper.userMessage(e)) }
                            break
                        }
                    }
                }
                delay(5_000)
            }
        }
    }

    fun stopPolling() {
        polling?.cancel()
        polling = null
    }

    fun retry() {
        _ui.update { it.copy(error = null) }
        startPolling()
    }
}
