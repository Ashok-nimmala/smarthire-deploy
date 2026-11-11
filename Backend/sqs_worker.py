"""
sqs_worker.py
-------------
The background half of the system. Every AI call happens here, never inside an
HTTP request.

Two job types, matching the two independent AI tasks:

    resume_match   JD + resume -> a score -> SCREENING_PASSED | HOLD | REJECTED
    answer_score   the written paper -> marks -> EXAM_PASSED | EXAM_REJECTED

Both are idempotent. A job already marked done returns immediately, every
status change is a conditional write, and a redelivered message is a cache hit
rather than a second AI call.

Failures are reported per message with batchItemFailures, so one poisoned
record cannot force the whole batch to be redelivered.
"""

from __future__ import annotations

import json
import traceback

import db
import llm
from models import (
    ApplicationStatus,
    JobStatus,
    auto_flags,
    combined_score,
    exam_id_for,
    exam_percent,
    screening_outcome,
    utcnow_iso,
)


# SQS redelivers a failed message this many times before giving up, and the
# queue's redrive policy must agree. One AI call fills most of a 30s
# invocation, so the redelivery IS the retry: the last one has to leave the
# application somewhere an admin can pick it up.
MAX_DELIVERIES = 5


def handle_sqs_event(event: dict) -> dict:
    """Lambda's SQS entry point. One record per invocation (batch size 1)."""
    failures = []
    for record in event.get("Records", []):
        message_id = record.get("messageId")
        try:
            body = json.loads(record.get("body") or "{}")
        except json.JSONDecodeError:
            # Unparseable: retrying cannot help, so drop it rather than spin.
            print(f"SQS record {message_id}: body is not JSON, dropping")
            continue
        delivery = int((record.get("attributes") or {})
                       .get("ApproximateReceiveCount", 1))
        try:
            _dispatch(body, last_try=delivery >= MAX_DELIVERIES)
        except Exception as e:                               # noqa: BLE001
            print(f"SQS record {message_id} failed: {type(e).__name__}: {e}")
            print(traceback.format_exc(limit=-6))
            failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": failures}


def _dispatch(body: dict, last_try: bool = False) -> None:
    job_id = body.get("job_id")
    job = db.get_job(job_id) if job_id else None
    if job and job.get("status") == JobStatus.DONE.value:
        return                                    # duplicate delivery
    job_type = (job or {}).get("job_type") or body.get("job_type")
    if job_type == "resume_match":
        _run_resume_match(body, last_try)
    elif job_type == "answer_score":
        _run_answer_score(body, last_try)
    else:
        print(f"unknown job type {job_type!r}, ignoring")


# ===========================================================================
# Resume screening
# ===========================================================================

def _run_resume_match(body: dict, last_try: bool = False) -> None:
    job_id, app_id = body["job_id"], body["app_id"]
    app_ = db.get_application(app_id)
    if not app_:
        db.update_job_status(job_id, JobStatus.FAILED.value, "application not found")
        return                                    # unrecoverable, do not retry

    jd = db.get_jd(app_["jd_id"])
    if not jd:
        db.update_job_status(job_id, JobStatus.FAILED.value, "job not found")
        return

    # Claim the work. NEW and REJECTED are both valid entry points (a re-screen
    # starts from REJECTED); anything else means another delivery got here
    # first, or the application has already moved on.
    if app_["status"] in (ApplicationStatus.NEW.value,
                          ApplicationStatus.REJECTED.value):
        claimed = db.transition_status(app_id, ApplicationStatus.SCREENING)
        if claimed is None:
            db.update_job_status(job_id, JobStatus.DONE.value, "lost the claim race")
            return
        # Audited only on the delivery that actually claimed the work. A
        # redelivery resumes from SCREENING and must not look like a restart.
        db.write_audit(entity_id=app_id, action="screening.started",
                       actor_id="system", org_id=app_["org_id"],
                       from_state=app_["status"],
                       to_state=ApplicationStatus.SCREENING.value)
    elif app_["status"] != ApplicationStatus.SCREENING.value:
        db.update_job_status(job_id, JobStatus.DONE.value,
                             f"already past screening ({app_['status']})")
        return

    db.update_job_status(job_id, JobStatus.RUNNING.value)

    try:
        result = llm.score_resume(jd, app_["resume_text"])
    except llm.LLMError as e:
        db.update_job_status(job_id, JobStatus.FAILED.value, str(e))
        if not last_try:
            raise                                 # let SQS redeliver
        # Out of deliveries. Hand the application back to NEW so it is not
        # stranded mid-screening: an admin can re-queue it with
        # /admin/jds/{jd_id}/screen once the AI is reachable again, and it
        # shows up in /admin/jobs/failed meanwhile.
        db.transition_status(app_id, ApplicationStatus.NEW)
        db.write_audit(entity_id=app_id, action="screening.gave_up",
                       actor_id="system", org_id=app_["org_id"],
                       from_state=ApplicationStatus.SCREENING.value,
                       to_state=ApplicationStatus.NEW.value,
                       metadata={"error": str(e)[:300], "deliveries": MAX_DELIVERIES})
        print(f"screening gave up on {app_id} after {MAX_DELIVERIES} tries: {e}")
        return

    score = int(result["score"])
    # The threshold copied onto the application at apply time wins, so editing
    # the job afterwards cannot change a verdict already in flight.
    threshold = int(app_.get("screening_threshold") or jd.get("screening_threshold", 70))
    target = screening_outcome(score, threshold)

    extra = {"resume_score": score, "resume_ai": result,
             "resume_scored_at": utcnow_iso()}
    if target is ApplicationStatus.SCREENING_PASSED:
        # Clearing screening is what makes the exam reachable.
        extra["exam_id"] = exam_id_for(app_id)

    try:
        moved = db.transition_status(app_id, target, extra_updates=extra)
    except ValueError as e:
        db.update_job_status(job_id, JobStatus.DONE.value, f"state moved: {e}")
        return
    if moved is None:
        db.update_job_status(job_id, JobStatus.DONE.value, "lost the transition race")
        return

    db.write_audit(entity_id=app_id, action="screening.completed",
                   actor_id="system", org_id=app_["org_id"],
                   from_state=ApplicationStatus.SCREENING.value,
                   to_state=target.value,
                   metadata={"resume_score": score, "threshold": threshold,
                             "outcome": target.value,
                             "confidence": int(result.get("confidence", 0))})
    db.update_job_status(job_id, JobStatus.DONE.value)
    print(f"screened {app_id}: score={score} threshold={threshold} -> {target.value}")


# ===========================================================================
# Written answer scoring
# ===========================================================================

def _run_answer_score(body: dict, last_try: bool = False) -> None:
    job_id, app_id = body["job_id"], body["app_id"]
    app_ = db.get_application(app_id)
    if not app_:
        db.update_job_status(job_id, JobStatus.FAILED.value, "application not found")
        return
    if app_["status"] != ApplicationStatus.EXAM_SCORING.value:
        db.update_job_status(job_id, JobStatus.DONE.value,
                             f"not awaiting scoring ({app_['status']})")
        return

    questions = {q["question_id"]: q for q in db.list_questions_for_jd(app_["jd_id"])}
    if not questions:
        db.update_job_status(job_id, JobStatus.FAILED.value, "the job has no questions")
        return

    answers = {a["question_id"]: a for a in db.list_answers(app_id)}
    marks_possible = sum(int(q.get("marks") or 0) for q in questions.values())

    # Only answered questions go to the model. An unanswered one was already
    # stored as 0 at submission time; sending it would waste tokens on a
    # foregone conclusion.
    items = [{
        "question_id": qid,
        "question": q["question"],
        "reference_answer": q["reference_answer"],
        "candidate_answer": (answers.get(qid) or {}).get("answer_text", ""),
        "max_marks": int(q.get("marks") or 0),
    } for qid, q in questions.items()
        if (answers.get(qid) or {}).get("answer_text", "").strip()]

    db.update_job_status(job_id, JobStatus.RUNNING.value)

    scored_rows = []
    marks_awarded = 0
    if items:
        try:
            result = llm.score_answers(items)
        except llm.LLMError as e:
            db.update_job_status(job_id, JobStatus.FAILED.value, str(e))
            if not last_try:
                raise                             # let SQS redeliver
            # Out of deliveries. The paper stays submitted and unmarked, which
            # is visible in /admin/jobs/failed; the candidate can re-send the
            # same paper to queue marking again.
            db.write_audit(entity_id=app_id, action="exam.scoring_gave_up",
                           actor_id="system", org_id=app_["org_id"],
                           metadata={"error": str(e)[:300],
                                     "deliveries": MAX_DELIVERIES})
            print(f"marking gave up on {app_id} after {MAX_DELIVERIES} tries: {e}")
            return

        now = utcnow_iso()
        for r in result["results"]:
            qid = r["question_id"]
            marks_awarded += int(r["marks_awarded"])
            scored_rows.append({
                "question_id": qid,
                "answer_text": (answers.get(qid) or {}).get("answer_text", ""),
                "submitted_at": (answers.get(qid) or {}).get("submitted_at", now),
                "max_marks": int(r["max_marks"]),
                "marks_awarded": int(r["marks_awarded"]),
                "feedback": str(r.get("feedback", ""))[:1000],
            })
        db.write_scored_answers(app_id, scored_rows)

    # The denominator is always the whole paper.
    pct = exam_percent(marks_awarded, marks_possible)
    threshold = int(app_.get("exam_threshold") or 60)
    passed = pct >= threshold

    resume_score = int(app_.get("resume_score") or 0)
    integrity = int(app_.get("integrity_score", 100))
    combined = combined_score(resume_score, pct, integrity)
    flags = auto_flags(resume_score, pct, integrity,
                       int((app_.get("resume_ai") or {}).get("confidence") or 100))

    target = (ApplicationStatus.EXAM_PASSED if passed
              else ApplicationStatus.EXAM_REJECTED)
    try:
        moved = db.transition_status(app_id, target, extra_updates={
            "exam_marks_awarded": marks_awarded,
            "exam_marks_possible": marks_possible,
            "exam_score": pct,
            "exam_scored_at": utcnow_iso(),
            "combined_score": combined,
            "auto_flagged": bool(flags),
            "auto_flag_reasons": flags,
        })
    except ValueError as e:
        db.update_job_status(job_id, JobStatus.DONE.value, f"state moved: {e}")
        return
    if moved is None:
        db.update_job_status(job_id, JobStatus.DONE.value, "already scored")
        return

    db.write_audit(entity_id=app_id, action="exam.scored", actor_id="system",
                   org_id=app_["org_id"],
                   from_state=ApplicationStatus.EXAM_SCORING.value,
                   to_state=target.value,
                   metadata={"marks_awarded": marks_awarded,
                             "marks_possible": marks_possible,
                             "score_percent": pct, "threshold": threshold,
                             "integrity": integrity, "combined": combined,
                             "flags": flags})

    if passed:
        # The interviewer was chosen when the job was created, so a passed exam
        # goes straight into their queue. There is nothing to schedule.
        handed_over = db.transition_status(app_id,
                                           ApplicationStatus.INTERVIEW_PENDING)
        if handed_over is not None:
            db.write_audit(entity_id=app_id, action="interview.pending",
                           actor_id="system", org_id=app_["org_id"],
                           from_state=ApplicationStatus.EXAM_PASSED.value,
                           to_state=ApplicationStatus.INTERVIEW_PENDING.value,
                           metadata={"interviewer_id": app_.get("assigned_interviewer")})

    db.update_job_status(job_id, JobStatus.DONE.value)
    print(f"scored {app_id}: {marks_awarded}/{marks_possible} = {pct}% "
          f"threshold={threshold} -> {target.value}")
