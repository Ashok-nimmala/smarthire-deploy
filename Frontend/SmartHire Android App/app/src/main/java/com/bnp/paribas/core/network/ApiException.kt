package com.bnp.paribas.core.network

/** status = HTTP status (0 = no connectivity), code = error.code from the backend envelope. */
class ApiException(
    val status: Int,
    val code: String?,
    override val message: String
) : Exception(message) {
    val isOffline: Boolean get() = status == 0
    val isUnauthorized: Boolean get() = status == 401
}

/** Central mapping from backend errors to candidate-friendly text. Never exposes raw JSON. */
object ErrorMapper {

    private const val GENERIC = "Something went wrong. Please try again."

    fun userMessage(e: Throwable): String {
        if (e !is ApiException) return GENERIC
        val code = e.code?.uppercase().orEmpty()
        val server = readable(e.message)

        return when {
            e.status == 0 -> "Internet connection required."
            e.status == 401 || code == "NOT_AUTHENTICATED" -> "Your session has expired. Please sign in again."
            e.status == 403 || code == "FORBIDDEN" -> server ?: "You don't have access to this."
            e.status == 404 || code == "NOT_FOUND" -> server ?: "We couldn't find what you were looking for."
            e.status == 405 || code == "METHOD_NOT_ALLOWED" -> GENERIC
            e.status == 409 || code == "CONFLICT" -> server ?: "This action was already completed."
            e.status == 422 || code == "VALIDATION_ERROR" -> server ?: "Please check the details and try again."
            e.status == 400 || code == "INVALID_REQUEST" -> server ?: "That request wasn't valid. Please try again."
            e.status == 429 || code == "RATE_LIMITED" -> "Too many attempts. Please try again in a moment."
            e.status == 503 || code == "SERVICE_UNAVAILABLE" -> "The service is temporarily unavailable. Please try again shortly."
            e.status >= 500 || code == "INTERNAL_ERROR" -> "Our servers are having trouble. Please try again shortly."
            else -> server ?: GENERIC
        }
    }

    /** Backend messages for 4xx are written for humans; drop anything that looks like raw JSON/HTML. */
    private fun readable(msg: String?): String? {
        val m = msg?.trim().orEmpty()
        if (m.isEmpty() || m.startsWith("{") || m.startsWith("[") || m.startsWith("<")) return null
        if (m.length > 200) return null
        return m.replaceFirstChar { it.uppercase() }.let { if (it.endsWith(".")) it else "$it." }
    }
}
