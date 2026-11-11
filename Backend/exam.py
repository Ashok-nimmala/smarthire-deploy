"""
exam.py
-------
The separate exam and proctoring system.

It is deliberately isolated from the candidate platform: its own login, its own
session scope, its own URL space. A platform session does not open an exam, and
an exam session opens exactly one exam and nothing else.

    GET  /exam/login?exam_id=...&email=...&password=...
    GET  /exam/{exam_id}
    GET  /exam/{exam_id}/start
    GET  /exam/{exam_id}/submit?answers=[...]      (POST for a long paper)
    GET  /exam/{exam_id}/result
    GET  /exam/{exam_id}/proctor/event?event_type=...

There is no signup, no /me, no logout, no password management here. The exam
system is intentionally minimal.

Eligibility is decided by the backend on every call - never by the frontend,
and never from anything the browser sends.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Optional

import boto3
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import APIRouter, Body, Depends, HTTPException, Query

import cache
import config
import db
from auth import Principal, clean_email, require_exam_session
from models import (
    AnswerRow,
    ApplicationStatus,
    JobRow,
    JobStatus,
    ProctorEventRow,
    Role,
    app_id_for,
    exam_id_for,
    jd_is_open,
    ok,
    utcnow_iso,
)

router = APIRouter(prefix="/exam", tags=["exam"])
_hasher = PasswordHasher()

SQS = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-south-1"))


def _answer_queue_url() -> str:
    return os.environ.get("SQS_ANSWER_SCORING_URL", "")


def _marking_gave_up(app_id: str) -> bool:
    """True when every scoring job for this paper has failed."""
    jobs = [j for j in db.list_batch_jobs(app_id)
            if j.get("job_type") == "answer_score"]
    return bool(jobs) and all(j.get("status") == JobStatus.FAILED.value
                              for j in jobs)


def _queue_marking(app_: dict, message: str = "") -> dict:
    """Put one answer_score job on the queue for this paper."""
    queue_url = _answer_queue_url()
    if not queue_url:
        raise HTTPException(503, "the scoring queue is not configured; nothing was submitted")
    app_id = app_["app_id"]
    now = utcnow_iso()
    job_id = db.new_id("job")
    db.create_job(JobRow(job_id=job_id, batch_id=app_id, job_type="answer_score",
                         app_id=app_id, org_id=app_["org_id"],
                         status=JobStatus.QUEUED, created_at=now, updated_at=now,
                         expires_at=db.ttl_from_now(24 * 3600)))
    SQS.send_message(QueueUrl=queue_url,
                     MessageBody=json.dumps({"job_id": job_id, "app_id": app_id}))
    if message:
        return ok({"exam_id": exam_id_for(app_id), "already_submitted": True,
                   "status": app_["status"], "requeued": True}, message)
    return {}


def _attempt(exam_id: str, p: Principal) -> dict:
    """
    Load the application behind an exam, re-checking every condition.

    The session already proves who the candidate is and which exam they opened;
    this re-reads the row so eligibility is judged against current state rather
    than against whatever was true at login.
    """
    app_ = db.get_application(app_id_for(exam_id))
    if not app_ or app_.get("candidate_id") != p.user_id:
        raise HTTPException(404, "exam not found")
    return app_


def _exam_view(app_: dict, jd: dict, questions: list[dict]) -> dict:
    return {
        "exam_id": app_.get("exam_id") or exam_id_for(app_["app_id"]),
        "job_title": jd.get("title"),
        "organization": jd.get("org_name"),
        "candidate_name": app_.get("candidate_name"),
        "question_count": len(questions),
        "total_marks": sum(int(q.get("marks") or 0) for q in questions),
        "status": app_.get("status"),
        "started": bool(app_.get("exam_started_at")),
        "submitted": bool(app_.get("exam_submitted_at")),
        "integrity_score": app_.get("integrity_score", 100),
    }


# ===========================================================================
# Login - declared before /{exam_id} so the literal path always wins
# ===========================================================================

@router.get("/login")
def exam_login(exam_id: str = Query(...), email: str = Query(...),
               password: str = Query(...)):
    """
    Sign in to one exam.

    Checks, in order: the account exists, the password is right, this candidate
    owns this exam, the job is still open, the candidate is eligible, and the
    exam has not already been submitted.
    """
    email = clean_email(email)
    if not cache.check_rate(f"examlogin:{email}",
                            limit=config.login_rate_per_5min(),
                            window_seconds=300):
        raise HTTPException(429, "too many attempts, try again in 5 minutes")

    user = db.get_user_by_email(email)
    if not user or not user.get("active", True):
        raise HTTPException(401, "incorrect email or password")
    try:
        _hasher.verify(user["password_hash"], password)
    except (VerifyMismatchError, VerificationError):
        raise HTTPException(401, "incorrect email or password")
    except Exception:                                        # noqa: BLE001
        raise HTTPException(401, "incorrect email or password")

    app_ = db.get_application(app_id_for(exam_id))
    # One message for "no such exam" and "not your exam", so an exam id cannot
    # be probed with someone else's account.
    if not app_ or app_.get("candidate_id") != user["user_id"]:
        raise HTTPException(404, "no exam found for this account")

    jd = db.get_jd(app_["jd_id"])
    if not jd_is_open(jd):
        raise HTTPException(403, "this job has closed, the exam is no longer available")

    status = app_["status"]
    if status in (ApplicationStatus.EXAM_SCORING.value,
                  ApplicationStatus.EXAM_PASSED.value,
                  ApplicationStatus.EXAM_REJECTED.value,
                  ApplicationStatus.INTERVIEW_PENDING.value,
                  ApplicationStatus.ACCEPTED.value,
                  ApplicationStatus.FINAL_REJECTED.value):
        raise HTTPException(409, "you have already submitted this exam")
    if status not in (ApplicationStatus.SCREENING_PASSED.value,
                      ApplicationStatus.EXAM_IN_PROGRESS.value):
        raise HTTPException(
            403, "you are not eligible for this exam yet")

    from auth import issue_session
    payload = issue_session(user, ttl_seconds=config.exam_session_ttl_seconds(),
                            scope="exam", exam_id=exam_id)
    db.write_audit(entity_id=app_["app_id"], action="exam.login",
                   actor_id=user["user_id"], actor_role=Role.CANDIDATE.value,
                   org_id=app_["org_id"], metadata={"exam_id": exam_id})
    return ok(payload, "Signed in to the exam")


# ===========================================================================
# The exam itself
# ===========================================================================

@router.get("/{exam_id}")
def exam_overview(exam_id: str, p: Principal = Depends(require_exam_session)):
    """What this exam is, before starting it. No questions yet."""
    app_ = _attempt(exam_id, p)
    jd = db.get_jd(app_["jd_id"]) or {}
    questions = db.list_questions_for_jd(app_["jd_id"])
    view = _exam_view(app_, jd, questions)
    view["can_start"] = app_["status"] in (
        ApplicationStatus.SCREENING_PASSED.value,
        ApplicationStatus.EXAM_IN_PROGRESS.value)
    return ok(view, "Exam")


@router.get("/{exam_id}/start")
def start_exam(exam_id: str, p: Principal = Depends(require_exam_session)):
    """
    Start, or resume, the attempt and hand over the questions.

    Idempotent: reopening after a disconnect returns the same questions and the
    integrity score as it stands, and never resets it.
    """
    app_ = _attempt(exam_id, p)
    jd = db.get_jd(app_["jd_id"]) or {}
    if not jd_is_open(jd):
        raise HTTPException(403, "this job has closed, the exam is no longer available")

    questions = db.list_questions_for_jd(app_["jd_id"])
    if not questions:
        raise HTTPException(409, "this exam has no questions yet")

    resumed = app_["status"] == ApplicationStatus.EXAM_IN_PROGRESS.value
    if not resumed:
        if app_["status"] != ApplicationStatus.SCREENING_PASSED.value:
            raise HTTPException(403, "you are not eligible for this exam")
        moved = db.transition_status(
            app_["app_id"], ApplicationStatus.EXAM_IN_PROGRESS,
            extra_updates={"exam_started_at": utcnow_iso(),
                           "integrity_score": 100})
        if moved is None:
            raise HTTPException(409, "the exam was started elsewhere, reload")
        app_ = moved
        db.write_audit(entity_id=app_["app_id"], action="exam.started",
                       actor_id=p.user_id, actor_role=Role.CANDIDATE.value,
                       org_id=app_["org_id"],
                       to_state=ApplicationStatus.EXAM_IN_PROGRESS.value,
                       metadata={"exam_id": exam_id})

    # The reference answer is the marking key. It is never sent here, and the
    # model that carries it never reaches this response.
    return ok({
        **_exam_view(app_, jd, questions),
        "resumed": resumed,
        "questions": [{"question_id": q["question_id"],
                       "question": q["question"],
                       "marks": int(q.get("marks") or 0),
                       "order": i + 1}
                      for i, q in enumerate(questions)],
        "how_to_submit": f"/exam/{exam_id}/submit?answers=[{{...}}]",
    }, "Exam started" if not resumed else "Exam resumed")


def _do_submit(exam_id: str, p: Principal, answers: list[dict]) -> dict:
    """
    Store every answer and queue ONE scoring job.

    The transition is conditional, so a double submit cannot queue a second
    job. Nothing is scored in this request: the AI runs on the queue.
    """
    app_ = _attempt(exam_id, p)
    app_id = app_["app_id"]

    if app_["status"] != ApplicationStatus.EXAM_IN_PROGRESS.value:
        if app_.get("exam_submitted_at"):
            # If marking gave up (the AI was unreachable for every delivery),
            # re-sending the paper queues it again rather than leaving the
            # candidate stuck on "being evaluated" forever.
            if (app_["status"] == ApplicationStatus.EXAM_SCORING.value
                    and _marking_gave_up(app_id)):
                return _queue_marking(app_, "Marking is being retried")
            return ok({"exam_id": exam_id, "already_submitted": True,
                       "status": app_["status"]},
                      "This exam was already submitted")
        raise HTTPException(409, f"cannot submit in state {app_['status']}")

    questions = {q["question_id"]: q for q in db.list_questions_for_jd(app_["jd_id"])}
    if not questions:
        raise HTTPException(409, "this exam has no questions")

    cleaned: dict[str, str] = {}
    for item in answers:
        if not isinstance(item, dict):
            raise HTTPException(400, "each answer must be an object with question_id and answer")
        qid = str(item.get("question_id", ""))
        text = str(item.get("answer", "") or "")
        if qid not in questions:
            raise HTTPException(400, f"question {qid} is not on this exam")
        if len(text) > 20000:
            raise HTTPException(400, f"the answer to {qid} is too long")
        cleaned[qid] = text

    queue_url = _answer_queue_url()
    if not queue_url:
        raise HTTPException(503, "the scoring queue is not configured; nothing was submitted")

    now = utcnow_iso()
    # Every question gets a row, answered or not, so the denominator is always
    # the whole paper: skipping a question costs marks rather than shrinking
    # the exam.
    for qid, q in questions.items():
        db.upsert_answer(AnswerRow(
            app_id=app_id, question_id=qid,
            answer_text=cleaned.get(qid, ""), submitted_at=now,
            max_marks=int(q.get("marks") or 0),
            **({"marks_awarded": 0, "feedback": "No answer submitted.",
                "scored_at": now} if qid not in cleaned else {})))

    try:
        moved = db.transition_status(app_id, ApplicationStatus.EXAM_SCORING,
                                     extra_updates={"exam_submitted_at": now})
    except ValueError as e:
        raise HTTPException(409, str(e))
    if moved is None:
        return ok({"exam_id": exam_id, "already_submitted": True,
                   "status": (db.get_application(app_id) or {}).get("status")},
                  "This exam was already submitted")

    _queue_marking(app_)

    db.write_audit(entity_id=app_id, action="exam.submitted", actor_id=p.user_id,
                   actor_role=Role.CANDIDATE.value, org_id=app_["org_id"],
                   from_state=ApplicationStatus.EXAM_IN_PROGRESS.value,
                   to_state=ApplicationStatus.EXAM_SCORING.value,
                   metadata={"answered": len(cleaned),
                             "questions_total": len(questions)})
    return ok({"exam_id": exam_id, "status": ApplicationStatus.EXAM_SCORING.value,
               "answers_received": len(cleaned),
               "questions_total": len(questions),
               "unanswered": len(questions) - len(cleaned),
               "result_at": f"/exam/{exam_id}/result"},
              "Exam submitted. Your answers are being evaluated.")


def _parse_answers(raw: str) -> list[dict]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            400, 'answers must be JSON, e.g. [{"question_id":"q_1","answer":"..."}]')
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(400, "answers must be a non-empty JSON array")
    if len(parsed) > 100:
        raise HTTPException(400, "too many answers")
    return parsed


@router.get("/{exam_id}/submit")
def submit_exam(exam_id: str,
                answers: str = Query(..., description='JSON array: [{"question_id":"q_1","answer":"..."}]'),
                p: Principal = Depends(require_exam_session)):
    """Submit the whole paper in the URL. Use the POST form below for a long
    paper that will not fit."""
    return _do_submit(exam_id, p, _parse_answers(answers))


@router.post("/{exam_id}/submit")
def submit_exam_long(exam_id: str, body: dict[str, Any] = Body(...),
                     p: Principal = Depends(require_exam_session)):
    """
    The documented exception to the GET-first rule.

    Written answers routinely run to thousands of characters, and a whole paper
    does not fit inside a practical URL length (~8 KB at the edge). This is the
    same operation as the GET above, for papers that are too large for it.
    Body: {"answers": [{"question_id": "...", "answer": "..."}]}
    """
    answers = body.get("answers")
    if not isinstance(answers, list) or not answers:
        raise HTTPException(400, 'body must be {"answers": [ ... ]}')
    if len(answers) > 100:
        raise HTTPException(400, "too many answers")
    return _do_submit(exam_id, p, answers)


@router.get("/{exam_id}/result")
def exam_result(exam_id: str, p: Principal = Depends(require_exam_session)):
    """
    The candidate's own totals.

    Never a reference answer, never a per-question breakdown, never the AI's
    reasoning: those are for the interviewer.
    """
    app_ = _attempt(exam_id, p)
    scored = app_.get("exam_score") is not None
    return ok({
        "exam_id": exam_id,
        "status": app_["status"],
        "submitted": bool(app_.get("exam_submitted_at")),
        "scored": scored,
        "marks_awarded": app_.get("exam_marks_awarded"),
        "marks_possible": app_.get("exam_marks_possible"),
        "score_percent": app_.get("exam_score"),
        "pass_threshold": app_.get("exam_threshold") if scored else None,
        "passed": (app_["status"] in (ApplicationStatus.EXAM_PASSED.value,
                                      ApplicationStatus.INTERVIEW_PENDING.value,
                                      ApplicationStatus.ACCEPTED.value,
                                      ApplicationStatus.FINAL_REJECTED.value)
                   if scored else None),
        "integrity_score": app_.get("integrity_score"),
    }, "Result" if scored else "Your answers are still being evaluated")


# ===========================================================================
# Proctoring
#
# The browser detects, the backend records. Nothing here is detected by the
# backend itself, and the penalty table lives in config.py, not in this file.
# ===========================================================================

@router.get("/{exam_id}/proctor/event")
def proctor_event(
    exam_id: str,
    event_type: str = Query(..., description="tab_switch, fullscreen_exit, copy, paste, right_click, devtools_open, multiple_faces, no_face, network_drop"),
    timestamp: Optional[str] = Query(None, description="when the browser saw it, ISO-8601"),
    duration: Optional[int] = Query(None, ge=0, le=86400),
    details: Optional[str] = Query(None, max_length=500),
    p: Principal = Depends(require_exam_session),
):
    """
    Record one suspicious event and apply its penalty to the integrity score.

    The penalty is applied atomically and only while the attempt is live, so an
    event replayed after submission cannot change a score that has already been
    used. The event log is append-only and the candidate never sees it.
    """
    penalties = config.proctor_penalties()
    if event_type not in penalties:
        raise HTTPException(
            400, f"unknown event_type; the backend recognises: {', '.join(sorted(penalties))}")

    app_ = _attempt(exam_id, p)
    app_id = app_["app_id"]
    if not cache.check_rate(f"proctor:{app_id}",
                            limit=config.proctor_events_per_second(),
                            window_seconds=1):
        raise HTTPException(429, "too many events, batch them client-side")

    penalty = int(penalties[event_type])
    new_score = db.degrade_integrity(app_id, penalty)
    if new_score is None:
        raise HTTPException(409, "this exam attempt is not in progress")

    metadata: dict[str, Any] = {}
    if duration is not None:
        metadata["duration"] = duration
    if details:
        metadata["details"] = details
    db.put_proctor_event(ProctorEventRow(
        app_id=app_id, event_ts=f"{utcnow_iso()}#{uuid.uuid4().hex[:6]}",
        event_type=event_type, penalty=penalty, exam_id=exam_id,
        metadata=metadata, client_ts=timestamp, server_ts=utcnow_iso()))
    return ok({"event_type": event_type, "penalty_applied": penalty,
               "integrity_score": new_score}, "Event recorded")
