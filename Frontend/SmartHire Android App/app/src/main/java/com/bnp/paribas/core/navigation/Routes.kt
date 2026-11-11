package com.bnp.paribas.core.navigation

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val SIGNUP = "signup"

    const val HOME = "home"
    const val JOBS = "jobs"
    const val APPLICATIONS = "applications"
    const val PROFILE = "profile"
    const val RESUME = "profile/resume"

    const val JOB = "jobs/{jdId}"
    const val APPLICATION = "applications/{appId}"

    const val EXAM_LOGIN = "exam/login/{examId}"
    const val EXAM = "exam/{examId}"
    const val EXAM_RESULT = "exam/{examId}/result"

    fun job(jdId: String) = "jobs/${Uri.encode(jdId)}"
    fun application(appId: String) = "applications/${Uri.encode(appId)}"
    fun examLogin(examId: String) = "exam/login/${Uri.encode(examId)}"
    fun exam(examId: String) = "exam/${Uri.encode(examId)}"
    fun examResult(examId: String) = "exam/${Uri.encode(examId)}/result"

    val mainTabs = setOf(HOME, JOBS, APPLICATIONS, PROFILE)
}

/**
 * smarthire://job/{jd_id}, smarthire://application/{app_id}, smarthire://exam/{exam_id}
 * Only an identifier is ever read from a link — never a token or credential.
 * If the user is logged out the destination is held until sign-in completes.
 */
object DeepLinks {
    private val _pending = MutableStateFlow<String?>(null)
    val pending: StateFlow<String?> = _pending.asStateFlow()

    fun handle(uri: Uri?) {
        if (uri == null || uri.scheme != "smarthire") return
        val id = uri.pathSegments.firstOrNull()?.takeIf { it.isNotBlank() } ?: return
        val route = when (uri.host) {
            "job" -> Routes.job(id)
            "application" -> Routes.application(id)
            "exam" -> Routes.examLogin(id)
            else -> null
        }
        if (route != null) _pending.value = route
    }

    fun consume() {
        _pending.value = null
    }
}
