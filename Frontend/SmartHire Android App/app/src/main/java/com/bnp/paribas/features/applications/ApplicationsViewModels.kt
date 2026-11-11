package com.bnp.paribas.features.applications

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.data.local.Graph

import com.bnp.paribas.data.models.ApplicationItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class ApplicationsUi(
    val apps: List<ApplicationItem> = emptyList(),
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null
)

class ApplicationsViewModel : ViewModel() {
    private val _ui = MutableStateFlow(ApplicationsUi())
    val ui: StateFlow<ApplicationsUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            Graph.applications.observeApplications().collect { list ->
                _ui.update { it.copy(apps = list, loaded = true) }
            }
        }
    }

    /** Read-only. Called when the screen becomes active and on pull-to-refresh. */
    fun refresh() {
        if (_ui.value.refreshing) return
        _ui.update { it.copy(refreshing = true, error = null) }
        viewModelScope.launch {
            try {
                Graph.applications.refreshApplications()
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
}

data class ApplicationDetailsUi(
    val app: ApplicationItem? = null,
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
           val error: String? = null
   )

class ApplicationDetailsViewModel(handle: SavedStateHandle) : ViewModel() {
    private val appId: String = handle.get<String>("appId").orEmpty()

    private val _ui = MutableStateFlow(ApplicationDetailsUi())
    val ui: StateFlow<ApplicationDetailsUi> = _ui.asStateFlow()

    private var polling: Job? = null
   
    init {
        viewModelScope.launch {
            Graph.applications.observeApplication(appId).collect { app ->
                _ui.update { it.copy(app = app, loaded = true) }
            }
        }
    }

    /**
     * Network first while the screen is active. Polls every 5 s while the application is still
     * being processed (NEW / SCREENING / EXAM_SCORING), then stops. Cancelled when the screen
     * leaves the foreground. Only the read-only GET is polled.
     */
    fun startPolling() {
        if (polling?.isActive == true) return
        polling = viewModelScope.launch {
            while (isActive) {
                val status = fetchOnce()
                if (status == null || status !in POLLING_STATUSES) break
                delay(5_000)
            }
        }
    }

    fun stopPolling() {
        polling?.cancel()
        polling = null
    }

    fun pullRefresh() {
        viewModelScope.launch { fetchOnce() }
    }

    private suspend fun fetchOnce(): String? {
        _ui.update { it.copy(refreshing = true, error = null) }
        return try {
            val item = Graph.applications.refreshApplication(appId)
            _ui.update { it.copy(refreshing = false, offline = false) }
            
            item.status
        } catch (e: ApiException) {
            _ui.update {
                it.copy(
                    refreshing = false,
                    offline = e.isOffline,
                    error = if (e.isOffline || e.isUnauthorized) null else ErrorMapper.userMessage(e)
                )
            }
            // Keep polling through transient connectivity problems while still processing.
            if (e.isOffline && _ui.value.app?.status in POLLING_STATUSES) _ui.value.app?.status else null
        }
    }

    

    private companion object {
        val POLLING_STATUSES = setOf("NEW", "SCREENING", "EXAM_SCORING")
       
    }
}
