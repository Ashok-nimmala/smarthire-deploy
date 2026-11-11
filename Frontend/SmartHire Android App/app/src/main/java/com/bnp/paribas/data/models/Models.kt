package com.bnp.paribas.data.models

/*
 * Candidate-safe models only. Deliberately absent: resume_score, combined_score, AI reasoning,
 * red flags, screening/exam thresholds, interviewer details, reference answers.
 */

data class Job(
    val jdId: String,
    val title: String,
    val org: String,
    val orgId: String?,
    val description: String,
    val postedAt: String?,
    val expiresAt: String?,
    val questionCount: Int?,
    val totalMarks: Int?
)

data class OrgProfile(val name: String, val description: String?)

data class ApplicationItem(
    val appId: String,
    val jdId: String?,
    val title: String,
    val org: String,
    val status: String,
    val statusMessage: String?,
    val createdAt: String?,
    val examId: String?,
    val rejection: Rejection? = null
)

data class Dashboard(
    val name: String?,
    val counts: Map<String, Int>,
    val recentApplications: List<ApplicationItem>,
    val recommendedJobs: List<Job>
) {
    fun count(vararg keys: String): Int? {
        for (k in keys) counts[k]?.let { return it }
        return null
    }

    /** The one application that currently needs the candidate to act (taken from API data). */
    val nextStep: ApplicationItem?
        get() = recentApplications.firstOrNull {
            it.examId != null && (it.status == "SCREENING_PASSED" || it.status == "EXAM_IN_PROGRESS")
        }
}

data class Profile(
    val name: String,
    val email: String,
    val resumeUploaded: Boolean,
    val resumeFilename: String?,
    val resumeUploadedAt: String?,
    val resumeCharacters: Int?
)

data class Rejection(
    val stage: String,                      // SCREENING | EXAM | INTERVIEW
    val reason: String,
    val missingRequirements: List<String> = emptyList(),
    val marksAwarded: String? = null,
    val marksPossible: String? = null,
    val scorePercent: String? = null,
    val decidedAt: String? = null
)

// ---- exam ----
data class ExamOverview(
    val examId: String,
    val jobTitle: String,
    val organization: String,
    val candidate: String,
    val questionCount: String,
    val totalMarks: String,
    val status: String,
    val started: Boolean,
    val submitted: Boolean,
    val integrity: String?,
    val canStart: Boolean,
    val message: String?
)

data class ExamQuestion(val id: String, val order: Int, val marks: String, val text: String)

data class ExamStart(
    val examId: String,
    val jobTitle: String?,
    val questions: List<ExamQuestion>,
    val integrity: String?,
    val deadlineMs: Long?
)

data class ExamResult(
    val scored: Boolean,
    val scorePercent: String?,
    val marksAwarded: String?,
    val marksPossible: String?,
    val passed: Boolean?,
    val integrity: String?,
    val status: String?
)
