package com.bnp.paribas.data.repository

import com.bnp.paribas.core.database.JobEntity
import com.bnp.paribas.core.network.apiCall
import com.bnp.paribas.core.utils.arr
import com.bnp.paribas.core.utils.objects
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.data.models.Job
import com.bnp.paribas.data.models.Mappers
import com.bnp.paribas.data.models.OrgProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

/** Public job data (no auth). Cached in Room for offline reading. */
class JobRepository {

    private val dao get() = Graph.db.cache()

    fun observeJobs(): Flow<List<Job>> =
        dao.jobs().map { list -> list.map { Mappers.job(JSONObject(it.json)) } }

    fun observeJob(jdId: String): Flow<Job?> =
        dao.job(jdId).map { e -> e?.let { Mappers.job(JSONObject(it.json)) } }

    suspend fun refreshJobs() {
        val d = apiCall { Graph.api.jobs() }
        val rows = (d.arr("jobs", "items", "results", "data")?.objects() ?: emptyList())
            .filter { Mappers.job(it).jdId.isNotEmpty() }
            .mapIndexed { i, o -> JobEntity(Mappers.job(o).jdId, o.toString(), i) }
        dao.replaceJobs(rows)
        Graph.store.setLastSync("jobs", System.currentTimeMillis())
    }

    suspend fun refreshJob(jdId: String) {
        val d = apiCall { Graph.api.job(jdId) }
        val o = d.optJSONObject("job") ?: d
        dao.upsertJobDetail(jdId, o.toString())
    }

    /** Search results are live (not cached). */
    suspend fun search(q: String, limit: Int = 20): List<Job> =
        Mappers.jobs(apiCall { Graph.api.search(q, limit) })

    suspend fun org(orgId: String): OrgProfile = Mappers.org(apiCall { Graph.api.org(orgId) })
}
