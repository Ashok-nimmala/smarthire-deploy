package com.bnp.paribas.features.profile

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.Profile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ProfileUi(
    val profile: Profile? = null,
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    val savingName: Boolean = false,
    val nameError: String? = null,
    val nameSaved: Boolean = false
)

class ProfileViewModel : ViewModel() {
    private val _ui = MutableStateFlow(ProfileUi())
    val ui: StateFlow<ProfileUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            Graph.candidate.observeProfile().collect { p -> _ui.update { it.copy(profile = p, loaded = true) } }
        }
    }

    fun refresh() {
        if (_ui.value.refreshing) return
        _ui.update { it.copy(refreshing = true, error = null) }
        viewModelScope.launch {
            try {
                Graph.candidate.refreshProfile()
                _ui.update { it.copy(refreshing = false, offline = false) }
            } catch (e: ApiException) {
                _ui.update {
                    it.copy(
                        refreshing = false,
                        offline = e.isOffline,
                        error = if (e.isOffline || e.isUnauthorized) null else ErrorMapper.userMessage(e)
                    )
                }
            }
        }
    }

    /** State-changing GET: only from the explicit "Save" action. */
    fun saveName(name: String) {
        if (_ui.value.savingName) return
        val n = name.trim()
        if (n.isEmpty() || n.length > 100) {
            _ui.update { it.copy(nameError = "Please enter your name (up to 100 characters)") }
            return
        }
        _ui.update { it.copy(savingName = true, nameError = null) }
        viewModelScope.launch {
            try {
                Graph.candidate.updateName(n)
                _ui.update { it.copy(savingName = false, nameSaved = true) }
            } catch (e: ApiException) {
                _ui.update { it.copy(savingName = false, nameError = ErrorMapper.userMessage(e)) }
            }
        }
    }

    fun clearNameState() {
        _ui.update { it.copy(nameError = null, nameSaved = false) }
    }

    /** Logout is local only (no logout API). The navigation layer reacts to the cleared session. */
    fun logout() {
        viewModelScope.launch { Graph.auth.logout() }
    }
}

data class ResumeUi(
    val profile: Profile? = null,
    val pickedName: String? = null,
    val pickedSize: Long = 0L,
    val pickedUri: Uri? = null,
    val error: String? = null,
    val uploading: Boolean = false,
    val progress: Float = 0f,
    val done: Boolean = false
)

class ResumeViewModel : ViewModel() {
    private val _ui = MutableStateFlow(ResumeUi())
    val ui: StateFlow<ResumeUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            Graph.candidate.observeProfile().collect { p -> _ui.update { it.copy(profile = p) } }
        }
    }

    /** Validates locally so invalid files never reach the backend. */
    fun onPicked(uri: Uri, name: String, size: Long, mime: String?) {
        if (_ui.value.uploading) return
        val isPdf = mime == "application/pdf" || name.lowercase().endsWith(".pdf")
        val error = when {
            !isPdf -> "Only PDF resumes are accepted."
            size <= 0L -> "That file is empty."
            size > MAX_BYTES -> "The resume must be under 5 MB."
            else -> null
        }
        _ui.update {
            it.copy(pickedUri = if (error == null) uri else null, pickedName = name, pickedSize = size,
                error = error, progress = 0f)
        }
    }

    fun upload() {
        val s = _ui.value
        val uri = s.pickedUri ?: return
        if (s.uploading) return
        _ui.update { it.copy(uploading = true, error = null, progress = 0f) }
        viewModelScope.launch {
            try {
                Graph.candidate.uploadResume(uri, s.pickedName ?: "resume.pdf", s.pickedSize) { p ->
                    _ui.update { it.copy(progress = p) }
                }
                _ui.update { it.copy(uploading = false, done = true) }
            } catch (e: ApiException) {
                _ui.update { it.copy(uploading = false, error = ErrorMapper.userMessage(e)) }
            }
        }
    }

    fun consumeDone() {
        _ui.update { it.copy(done = false, pickedUri = null, pickedName = null) }
    }

    private companion object {
        const val MAX_BYTES = 5L * 1024 * 1024
    }
}
