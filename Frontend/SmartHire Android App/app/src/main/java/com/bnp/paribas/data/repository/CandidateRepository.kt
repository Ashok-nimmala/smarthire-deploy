package com.bnp.paribas.data.repository

import android.net.Uri
import com.bnp.paribas.core.database.DashboardEntity
import com.bnp.paribas.core.database.ProfileEntity
import com.bnp.paribas.core.network.apiCall
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.Dashboard
import com.bnp.paribas.data.models.Mappers
import com.bnp.paribas.data.models.Profile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okhttp3.MultipartBody
import org.json.JSONObject

/** Dashboard + profile + resume. Cache first (Room), then network refresh. */
class CandidateRepository {

    private val dao get() = Graph.db.cache()

    // ---- dashboard ----
    fun observeDashboard(): Flow<Dashboard?> =
        dao.dashboard().map { e -> e?.let { Mappers.dashboard(JSONObject(it.json)) } }

    suspend fun refreshDashboard() {
        val d = Graph.authed { apiCall { Graph.api.dashboard(it) } }
        val now = System.currentTimeMillis()
        dao.putDashboard(DashboardEntity(0, d.toString(), now))
        Graph.store.setLastSync("dashboard", now)
    }

    // ---- profile ----
    fun observeProfile(): Flow<Profile?> =
        dao.profile().map { e -> e?.let { Mappers.profile(JSONObject(it.json)) } }

    suspend fun refreshProfile() {
        val d = Graph.authed { apiCall { Graph.api.me(it) } }
        val now = System.currentTimeMillis()
        dao.putProfile(ProfileEntity(0, d.toString(), now))
        Graph.store.setLastSync("profile", now)
    }

    /** State-changing GET: only ever called from an explicit user action. */
    suspend fun updateName(name: String) {
        Graph.authed { apiCall { Graph.api.updateName(it, name) } }
        refreshProfile()
    }

    /** Streams the PDF from the picker Uri (never loads it fully into memory). */
    suspend fun uploadResume(uri: Uri, filename: String, size: Long, onProgress: (Float) -> Unit) {
        val body = UriRequestBody(Graph.context, uri, size, onProgress)
        val part = MultipartBody.Part.createFormData("file", filename, body)
        Graph.authed { apiCall { Graph.api.uploadResume(it, part) } }
        refreshProfile()
    }
}
