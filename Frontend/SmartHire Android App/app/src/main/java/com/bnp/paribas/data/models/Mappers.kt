package com.bnp.paribas.data.models

import com.bnp.paribas.core.utils.arr
import com.bnp.paribas.core.utils.bool
import com.bnp.paribas.core.utils.int
import com.bnp.paribas.core.utils.obj
import com.bnp.paribas.core.utils.objects
import com.bnp.paribas.core.utils.str
import com.bnp.paribas.core.utils.tidyNumber
import org.json.JSONObject

/**
 * ALL JSON -> model mapping lives here. Each field accepts a few alternative key names,
 * so if the backend uses a different key, this is the only file to adjust.
 */
object Mappers {

    fun job(o: JSONObject): Job = Job(
        jdId = o.str("jd_id", "id") ?: "",
        title = o.str("title", "job_title", "name") ?: "Untitled role",
        org = o.str("org_name", "organization_name", "organization", "company")
            ?: o.obj("org", "organization")?.str("name", "org_name")
            ?: "",
        orgId = o.str("org_id") ?: o.obj("org", "organization")?.str("org_id", "id"),
        description = o.str("description", "summary", "jd_text") ?: "",
        postedAt = o.str("created_at", "posted_at", "posted_on"),
        expiresAt = o.str("expires_at", "expiry_date", "expiry", "closes_at", "deadline"),
        questionCount = o.int("question_count", "questions")
            ?: o.obj("exam", "assessment")?.int("question_count"),
        totalMarks = o.int("total_marks")
            ?: o.obj("exam", "assessment")?.int("total_marks")
    )

    fun jobs(d: JSONObject): List<Job> =
        (d.arr("jobs", "items", "results", "data")?.objects() ?: emptyList())
            .map { job(it) }
            .filter { it.jdId.isNotEmpty() }

    fun org(d: JSONObject): OrgProfile {
        val o = d.obj("org", "organization") ?: d
        return OrgProfile(
            name = o.str("name", "org_name") ?: "",
            description = o.str("description", "about", "summary")
        )
    }

    fun application(raw: JSONObject): ApplicationItem {
        val o = raw.obj("application") ?: raw
        val examId = o.obj("exam")?.str("exam_id", "id") ?: o.str("exam_id")
        return ApplicationItem(
            appId = o.str("app_id", "id") ?: "",
            jdId = o.str("jd_id") ?: o.obj("job")?.str("jd_id", "id"),
            title = o.str("job_title", "title") ?: o.obj("job")?.str("title", "job_title") ?: "Application",
            org = o.str("org_name", "organization_name", "organization", "company")
                ?: o.obj("job")?.str("org_name", "organization")
                ?: "",
            status = (o.str("status") ?: "NEW").uppercase(),
            statusMessage = o.str("status_message"),
            createdAt = o.str("created_at", "applied_at", "updated_at"),
            examId = examId,
            rejection = rejection(o.obj("rejection"))
        )
    }

    fun applications(d: JSONObject): List<ApplicationItem> =
        (d.arr("applications", "items", "results")?.objects() ?: emptyList())
            .map { application(it) }
            .filter { it.appId.isNotEmpty() }

    fun dashboard(d: JSONObject): Dashboard {
        val counts = HashMap<String, Int>()
        d.obj("counts")?.let { c ->
            val keys = c.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                c.int(k)?.let { counts[k] = it }
            }
        }
        return Dashboard(
            name = d.str("name", "candidate_name") ?: d.obj("candidate")?.str("name"),
            counts = counts,
            recentApplications = (d.arr("recent_applications", "applications", "recent")?.objects() ?: emptyList())
                .map { application(it) }
                .filter { it.appId.isNotEmpty() },
            recommendedJobs = (d.arr("recommended_jobs")?.objects() ?: emptyList())
                .map { job(it) }
                .filter { it.jdId.isNotEmpty() }
        )
    }

    fun profile(d: JSONObject): Profile {
        val o = d.obj("candidate", "profile") ?: d
        return Profile(
            name = o.str("name") ?: "",
            email = o.str("email") ?: "",
            resumeUploaded = o.bool("resume_uploaded") ?: (o.str("resume_filename") != null),
            resumeFilename = o.str("resume_filename"),
            resumeUploadedAt = o.str("resume_uploaded_at"),
            resumeCharacters = o.int("resume_characters")
        )
    }

  
      fun rejection(r: JSONObject?): Rejection? {
        if (r == null) return null
        val missing = r.optJSONArray("missing_requirements")?.let { a ->
            (0 until a.length()).mapNotNull { i -> a.optString(i).takeIf { it.isNotBlank() } }
        } ?: emptyList()
        return Rejection(
            stage = (r.str("stage") ?: "").uppercase(),
            reason = r.str("reason") ?: "",
            missingRequirements = missing,
            marksAwarded = tidyNumber(r.str("marks_awarded")),
            marksPossible = tidyNumber(r.str("marks_possible")),
            scorePercent = tidyNumber(r.str("score_percent")),
            decidedAt = r.str("decided_at")
        )
    }

    // ---- exam ----
    fun examOverview(d: JSONObject, fallbackId: String): ExamOverview = ExamOverview(
        examId = d.str("exam_id") ?: fallbackId,
        jobTitle = d.str("job_title") ?: "Assessment",
        organization = d.str("organization", "org_name") ?: "",
        candidate = d.str("candidate_name", "name") ?: "",
        questionCount = d.str("question_count") ?: "—",
        totalMarks = tidyNumber(d.str("total_marks")) ?: "—",
        status = d.str("status") ?: "",
        started = d.bool("started") ?: false,
        submitted = d.bool("submitted") ?: false,
        integrity = tidyNumber(d.str("integrity_score")),
        canStart = d.bool("can_start") ?: true,
        message = d.str("message")
    )

    fun examStart(d: JSONObject, fallbackId: String): ExamStart {
        val qs = (d.arr("questions")?.objects() ?: emptyList()).mapIndexed { i, q ->
            ExamQuestion(
                id = q.str("question_id", "id") ?: "",
                order = q.int("order") ?: (i + 1),
                marks = tidyNumber(q.str("marks")) ?: "0",
                text = q.str("question", "text") ?: ""
            )
        }.filter { it.id.isNotEmpty() }.sortedBy { it.order }

        return ExamStart(
            examId = d.str("exam_id") ?: fallbackId,
            jobTitle = d.str("job_title"),
            questions = qs,
            integrity = tidyNumber(d.str("integrity_score")),
            deadlineMs = examDeadline(d)
        )
    }

    /**
     * The backend is the source of truth for timing. If it supplies none of these fields
     * there is no countdown and no local auto-submit — a duration is never invented.
     */
    private fun examDeadline(d: JSONObject): Long? {
        val now = System.currentTimeMillis()
        d.str("time_remaining_seconds", "remaining_seconds")?.toDoubleOrNull()?.let {
            return now + (it * 1000).toLong()
        }
        d.str("expires_at", "ends_at", "deadline", "end_time")?.let { raw ->
            parseInstantMs(raw)?.let { return it }
        }
        val durSec = d.str("duration_seconds", "time_limit_seconds")?.toDoubleOrNull()
        val durMin = d.str("duration_minutes", "time_limit_minutes")?.toDoubleOrNull()
        val dur = durSec ?: durMin?.times(60)
        if (dur != null) {
            val started = d.str("started_at")?.let { parseInstantMs(it) } ?: now
            return started + (dur * 1000).toLong()
        }
        return null
    }

    private fun parseInstantMs(raw: String): Long? =
        raw.toDoubleOrNull()?.let { if (it > 1e11) it.toLong() else (it * 1000).toLong() }
            ?: try {
                java.time.Instant.parse(raw).toEpochMilli()
            } catch (e: Exception) {
                try {
                    java.time.OffsetDateTime.parse(raw).toInstant().toEpochMilli()
                } catch (e2: Exception) {
                    null
                }
            }

    fun examResult(d: JSONObject): ExamResult = ExamResult(
        scored = d.bool("scored") ?: false,
        scorePercent = tidyNumber(d.str("score_percent")),
        marksAwarded = tidyNumber(d.str("marks_awarded")),
        marksPossible = tidyNumber(d.str("marks_possible")),
        passed = d.bool("passed"),
        integrity = tidyNumber(d.str("integrity_score")),
        status = d.str("status")
    )
}
