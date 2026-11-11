package com.bnp.paribas.features.jobs

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.Job
import com.bnp.paribas.data.models.OrgProfile
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class JobsUi(
    val query: String = "",
    val jobs: List<Job> = emptyList(),
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    val searching: Boolean = false,
    val results: List<Job>? = null // null = not searching
)

@OptIn(FlowPreview::class)
class JobsViewModel : ViewModel() {
    private val _ui = MutableStateFlow(JobsUi())
    val ui: StateFlow<JobsUi> = _ui.asStateFlow()

    private val query = MutableStateFlow("")

    init {
        viewModelScope.launch {
            Graph.jobs.observeJobs().collect { list -> _ui.update { it.copy(jobs = list, loaded = true) } }
        }
        // 400 ms debounce, minimum 2 characters, cancels the previous in-flight search.
        viewModelScope.launch {
            query.debounce(400).distinctUntilChanged().collectLatest { q ->
                val t = q.trim()
                if (t.length < 2) {
                    _ui.update { it.copy(results = null, searching = false) }
                } else {
                    _ui.update { it.copy(searching = true) }
                    try {
                        val r = Graph.jobs.search(t)
                        _ui.update { it.copy(results = r, searching = false, offline = false) }
                    } catch (e: ApiException) {
                        _ui.update {
                            it.copy(results = emptyList(), searching = false, offline = e.isOffline,
                                error = if (e.isOffline) null else ErrorMapper.userMessage(e))
                        }
                    }
                }
            }
        }
    }

    fun onQueryChange(q: String) {
        _ui.update { it.copy(query = q, results = if (q.trim().length < 2) null else it.results) }
        query.value = q
    }

    /** Called when the screen becomes visible, and by pull-to-refresh. Read-only. */
    fun refresh() {
        if (_ui.value.refreshing) return
        _ui.update { it.copy(refreshing = true, error = null) }
        viewModelScope.launch {
            try {
                Graph.jobs.refreshJobs()
                _ui.update { it.copy(refreshing = false, offline = false) }
            } catch (e: ApiException) {
                _ui.update {
                    it.copy(refreshing = false, offline = e.isOffline,
                        error = if (e.isOffline) null else ErrorMapper.userMessage(e))
                }
            }
        }
    }
}

data class JobDetailsUi(
    val job: Job? = null,
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null,
    val org: OrgProfile? = null,
    val showConfirm: Boolean = false,
    val applying: Boolean = false,
    val applyError: String? = null,
    val appliedAppId: String? = null
)

class JobDetailsViewModel(handle: SavedStateHandle) : ViewModel() {
    private val jdId: String = handle.get<String>("jdId").orEmpty()

    private val _ui = MutableStateFlow(JobDetailsUi())
    val ui: StateFlow<JobDetailsUi> = _ui.asStateFlow()

    private var orgRequested = false

    init {
        viewModelScope.launch {
            Graph.jobs.observeJob(jdId).collect { job ->
                _ui.update { it.copy(job = job, loaded = true) }
                val orgId = job?.orgId
                if (orgId != null && !orgRequested) {
                    orgRequested = true
                    loadOrg(orgId)
                }
            }
        }
        refresh()
    }

    private fun loadOrg(orgId: String) {
        viewModelScope.launch {
            try {
                val o = Graph.jobs.org(orgId)
                _ui.update { it.copy(org = o) }
            } catch (e: ApiException) {
                // Organisation profile is optional; ignore failures.
            }
        }
    }

    fun refresh() {
        if (_ui.value.refreshing) return
        _ui.update { it.copy(refreshing = true, error = null) }
        viewModelScope.launch {
            try {
                Graph.jobs.refreshJob(jdId)
                _ui.update { it.copy(refreshing = false, offline = false) }
            } catch (e: ApiException) {
                _ui.update {
                    it.copy(refreshing = false, offline = e.isOffline,
                        error = if (e.isOffline) null else ErrorMapper.userMessage(e))
                }
            }
        }
    }

    // ---- Apply: explicit confirmation required; never automatic ----
    fun requestApply() {
        if (_ui.value.applying) return
        _ui.update { it.copy(showConfirm = true, applyError = null) }
    }

    fun dismissConfirm() {
        _ui.update { it.copy(showConfirm = false) }
    }

    fun confirmApply() {
        if (_ui.value.applying) return
        _ui.update { it.copy(showConfirm = false, applying = true, applyError = null) }
        viewModelScope.launch {
            try {
                val appId = Graph.applications.apply(jdId)
                _ui.update { it.copy(applying = false, appliedAppId = appId) }
            } catch (e: ApiException) {
                val msg = if (e.status == 409) "You've already applied for this position." else ErrorMapper.userMessage(e)
                _ui.update { it.copy(applying = false, applyError = msg) }
            }
        }
    }

    fun consumeApplied() {
        _ui.update { it.copy(appliedAppId = null) }
    }

    fun clearApplyError() {
        _ui.update { it.copy(applyError = null) }
    }
}
