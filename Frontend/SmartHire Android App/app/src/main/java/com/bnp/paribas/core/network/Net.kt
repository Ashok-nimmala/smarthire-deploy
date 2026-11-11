package com.bnp.paribas.core.network

import com.bnp.paribas.data.api.SmartHireApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import retrofit2.Response
import retrofit2.Retrofit
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiConfig {
    /** The one and only place the backend URL lives. */
    const val BASE_URL = "https://r6j6keh5jn7ne2oykddo7k5vpi0rhdjx.lambda-url.ap-south-1.on.aws"
}

object Net {
    // Deliberately no logging interceptor: nothing sensitive may reach logs.
    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false) // several endpoints are state-changing GETs
            .build()
    }

    val api: SmartHireApi by lazy {
        Retrofit.Builder()
            .baseUrl(ApiConfig.BASE_URL + "/")
            .client(http)
            .build()
            .create(SmartHireApi::class.java)
    }
}

/**
 * Runs a Retrofit call, unwraps the { success, data, error } envelope and returns `data`
 * as a JSONObject (a bare array is wrapped as { "items": [...] }).
 * Any failure is thrown as [ApiException]. Never retries.
 */
suspend fun apiCall(block: suspend () -> Response<ResponseBody>): JSONObject =
    withContext(Dispatchers.IO) {
        val resp = try {
            block()
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "Unable to reach the server.")
        }

        val text = try {
            (if (resp.isSuccessful) resp.body()?.string() else resp.errorBody()?.string()).orEmpty()
        } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "Unable to reach the server.")
        }

        val json = try {
            JSONObject(text)
        } catch (e: JSONException) {
            null
        }

        val declaredFailure = json != null && json.has("success") && !json.optBoolean("success", true)
        if (!resp.isSuccessful || declaredFailure) {
            val err = json?.optJSONObject("error")
            val code = err?.opt("code")?.takeIf { it != JSONObject.NULL }?.toString()
            val msg = err?.optString("message").orEmpty()
            throw ApiException(resp.code(), code, msg)
        }

        when (val data = json?.opt("data")) {
            is JSONObject -> data
            is JSONArray -> JSONObject().put("items", data)
            else -> json ?: JSONObject()
        }
    }
