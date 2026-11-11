package com.bnp.paribas.data.repository

import com.bnp.paribas.core.database.ApplicationEntity
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.apiCall
import com.bnp.paribas.core.utils.arr
import com.bnp.paribas.core.utils.objects
import com.bnp.paribas.core.utils.str
import com.bnp.paribas.data.local.Graph

import com.bnp.paribas.data.models.ApplicationItem
import com.bnp.paribas.data.models.Mappers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

class ApplicationRepository {

    private val dao get() = Graph.db.cache()

    fun observeApplications(): Flow<List<ApplicationItem>> =
        dao.applications().map { list -> list.map { Mappers.application(JSONObject(it.json)) } }

    fun observeApplication(appId: String): Flow<ApplicationItem?> =
        dao.application(appId).map { e -> e?.let { Mappers.application(JSONObject(it.json)) } }

    suspend fun refreshApplications() {
        val d = Graph.authed { apiCall { Graph.api.applications(it) } }
        val rows = (d.arr("applications", "items", "results")?.objects() ?: emptyList())
            .filter { Mappers.application(it).appId.isNotEmpty() }
            .mapIndexed { i, o -> ApplicationEntity(Mappers.application(o).appId, o.toString(), i) }
        dao.replaceApplications(rows)
        Graph.store.setLastSync("applications", System.currentTimeMillis())
    }

    /** Network first: statuses change while the candidate is looking at the screen. */
    suspend fun refreshApplication(appId: String): ApplicationItem {
        val d = Graph.authed { apiCall { Graph.api.application(it, appId) } }
        val item = Mappers.application(d)
        dao.upsertApplicationDetail(appId, d.toString())
        return item
    }

    /** State-changing GET: only called after the candidate confirms "Apply". Returns app_id. */
    suspend fun apply(jdId: String): String {
        val d = Graph.authed { apiCall { Graph.api.apply(it, jdId) } }
        return d.str("app_id")
            ?: d.optJSONObject("application")?.str("app_id")
            ?: throw ApiException(500, "INTERNAL_ERROR", "Unexpected response from server.")
    }

   
}
