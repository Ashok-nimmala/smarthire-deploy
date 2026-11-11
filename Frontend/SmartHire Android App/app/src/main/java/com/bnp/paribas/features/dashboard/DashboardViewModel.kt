package com.bnp.paribas.features.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.ErrorMapper
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.Dashboard
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class DashboardUi(
    val dashboard: Dashboard? = null,
    val sessionName: String = "",
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val offline: Boolean = false,
    val error: String? = null
)

/**
 * Cache first (Room) -> display -> network refresh -> update cache -> UI updates.
 * While Home is visible it also refreshes every 60 s; that loop stops when Home leaves the
 * foreground. Only read-only endpoints are ever called from here.
 */
class DashboardViewModel : ViewModel() {
    private val _ui = MutableStateFlow(DashboardUi())
    val ui: StateFlow<DashboardUi> = _ui.asStateFlow()

    private var auto: Job? = null

    init {
        viewModelScope.launch {
            val name = Graph.store.session.first()?.name.orEmpty()
            _ui.update { it.copy(sessionName = name) }
        }
        viewModelScope.launch {
            Graph.candidate.observeDashboard().collect { d ->
                _ui.update { it.copy(dashboard = d, loaded = true) }
            }
        }
    }

    /** Idempotent: never creates a duplicate refresh job. */
    fun startAutoRefresh() {
        if (auto?.isActive == true) return
        auto = viewModelScope.launch {
            while (isActive) {
                doRefresh()
                delay(REFRESH_INTERVAL_MS)
            }
        }
    }

    fun stopAutoRefresh() {
        auto?.cancel()
        auto = null
    }

    /** Pull-to-refresh. */
    fun pullRefresh() {
        viewModelScope.launch { doRefresh() }
    }

    private suspend fun doRefresh() {
        if (_ui.value.refreshing) return
        _ui.update { it.copy(refreshing = true) }
        try {
            Graph.candidate.refreshDashboard()
            _ui.update { it.copy(refreshing = false, offline = false, error = null) }
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

    private companion object {
        const val REFRESH_INTERVAL_MS = 60_000L
    }
}
