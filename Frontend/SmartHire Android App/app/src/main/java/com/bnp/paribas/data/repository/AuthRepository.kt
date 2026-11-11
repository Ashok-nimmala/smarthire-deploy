package com.bnp.paribas.data.repository

import com.bnp.paribas.core.datastore.Session
import com.bnp.paribas.core.network.ApiException
import com.bnp.paribas.core.network.apiCall
import com.bnp.paribas.core.utils.str
import com.bnp.paribas.data.local.Graph
import org.json.JSONObject

class AuthRepository {

    suspend fun login(email: String, password: String) {
        saveIfCandidate(apiCall { Graph.api.login(email, password) })
    }

    /** Signup returns a candidate session directly, so the user is not asked to log in again. */
    suspend fun signup(name: String, email: String, password: String) {
        saveIfCandidate(apiCall { Graph.api.signup(email, password, name) })
    }

    /** There is no logout API: logout is purely local. */
    suspend fun logout() {
        Graph.clearEverything()
    }

    private suspend fun saveIfCandidate(d: JSONObject) {
        val role = d.str("role")?.lowercase()
        if (role != "candidate") {
            // Never open the candidate app for another role, and never keep its token.
            throw ApiException(403, "FORBIDDEN", "This app is for candidates only.")
        }
        val token = d.str("session_token")
            ?: throw ApiException(500, "INTERNAL_ERROR", "Unexpected response from server.")
        Graph.store.saveSession(
            Session(
                token = token,
                userId = d.str("user_id").orEmpty(),
                name = d.str("name").orEmpty(),
                email = d.str("email").orEmpty(),
                role = role
            )
        )
    }
}
