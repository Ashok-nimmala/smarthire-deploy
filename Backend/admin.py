"""
admin.py
--------
Everything an admin does. The router carries Depends(require_admin), so every
handler runs with p.role == ADMIN and p.org_id set.

Tenant isolation lives in db.py: a read or write for a resource outside
p.org_id comes back None and the route answers 404 - never 403, so an id
cannot be probed across organizations.

Method convention: GET for everything, with all input in the path and query
string (see the API method rules in architecture.txt). No POST, PATCH, PUT or
DELETE appears in this file.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query

import config
import db
from auth import Principal, check_password, clean_email, hash_password, require_admin
from models import (
    ApplicationStatus,
    JDRow,
    JobRow,
    JobStatus,
    QuestionRow,
    Role,
    UserRow,
    exam_id_for,
    jd_is_expired,
    jd_state,
    ok,
    parse_iso,
    utcnow_iso,
)

router = APIRouter(prefix="/admin", tags=["admin"],
                   dependencies=[Depends(require_admin)])

SQS = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-south-1"))


def _screening_queue_url() -> str:
    return os.environ.get("SQS_SCREENING_URL", "")


def _scoped_jd(jd_id: str, p: Principal) -> dict:
    jd = db.get_jd_scoped(jd_id, p.org_id)
    if not jd or jd.get("deleted"):
        raise HTTPException(404, "job not found")
    return jd


def _scoped_app(app_id: str, p: Principal) -> dict:
    app_ = db.get_application(app_id)
    if not app_ or app_.get("org_id") != p.org_id:
        raise HTTPException(404, "application not found")
    return app_


def _resolve_expiry(expiry: Optional[str]) -> tuple[str, int]:
    """Normalise a deadline into (iso, epoch). Absent means the default
    validity window; a past instant is refused."""
    if not expiry:
        dt = datetime.now(timezone.utc) + timedelta(
            days=config.default_job_validity_days())
        return dt.isoformat(), int(dt.timestamp())
    dt = parse_iso(expiry)
    if dt is None:
        raise HTTPException(400, "expiry must be a date (2026-12-31) or an ISO-8601 timestamp")
    epoch = int(dt.timestamp())
    if epoch <= int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(400, "that expiry is already in the past")
    return dt.isoformat(), epoch


def _jd_view(jd: dict, question_count: Optional[int] = None) -> dict:
    """Admin-facing JD, with the derived lifecycle state spelled out."""
    view = {
        "jd_id": jd["jd_id"], "title": jd.get("title"),
        "description": jd.get("description"),
        "state": jd_state(jd),
        "is_live": jd.get("is_live") == "true",
        "expires_at": jd.get("expires_at"),
        "expired": jd_is_expired(jd),
        "screening_threshold": jd.get("screening_threshold"),
        "exam_threshold": jd.get("exam_threshold"),
        "interviewer_id": jd.get("interviewer_id"),
        "interviewer_name": jd.get("interviewer_name"),
        "posted_at": jd.get("posted_at"),
        "created_at": jd.get("created_at"),
        "updated_at": jd.get("updated_at"),
    }
    if question_count is not None:
        view["question_count"] = question_count
    return view


# ===========================================================================
# Dashboard
# ===========================================================================

@router.get("/dashboard")
def dashboard(p: Principal = Depends(require_admin)):
    """Everything the admin home screen needs, in one call."""
    jds = db.list_org_jds(p.org_id)
    by_status: dict[str, int] = {}
    total_apps = holds = flagged = exams_completed = pending_decisions = 0
    accepted = rejected = 0
    jd_cards = []

    for jd in jds:
        apps = db.query_apps_by_jd(jd["jd_id"])
        total_apps += len(apps)
        for a in apps:
            st = a.get("status", "NEW")
            by_status[st] = by_status.get(st, 0) + 1
            if st == ApplicationStatus.HOLD.value:
                holds += 1
            if st == ApplicationStatus.INTERVIEW_PENDING.value:
                pending_decisions += 1
            if st == ApplicationStatus.ACCEPTED.value:
                accepted += 1
            if st in (ApplicationStatus.REJECTED.value,
                      ApplicationStatus.EXAM_REJECTED.value,
                      ApplicationStatus.FINAL_REJECTED.value):
                rejected += 1
            if a.get("exam_score") is not None:
                exams_completed += 1
            if a.get("auto_flagged"):
                flagged += 1
        jd_cards.append({
            "jd_id": jd["jd_id"], "title": jd.get("title"),
            "state": jd_state(jd),
            "interviewer_name": jd.get("interviewer_name"),
            "question_count": len(db.list_questions_for_jd(jd["jd_id"])),
            "applications": len(apps),
            "screening_holds": sum(
                1 for a in apps if a.get("status") == ApplicationStatus.HOLD.value),
        })

    background = {s.value: len(db.list_jobs_by_org_status(p.org_id, s.value, limit=100))
                  for s in JobStatus}
    org = db.get_org(p.org_id) or {}

    return ok({
        "organization": {"org_id": p.org_id, "name": org.get("name")},
        "totals": {
            "total_jobs": len(jds),
            "live_jobs": sum(1 for j in jds if jd_state(j) == "LIVE"),
            "total_applications": total_apps,
            "screening_holds": holds,
            "exams_completed": exams_completed,
            "pending_interview_decisions": pending_decisions,
            "accepted_candidates": accepted,
            "rejected_candidates": rejected,
            "auto_flagged_applications": flagged,
            "interviewers": len(db.list_org_interviewers(p.org_id)),
        },
        "applications_by_status": by_status,
        "background_jobs": background,
        "jobs": jd_cards,
        "action_required": {
            "screening_holds": holds,
            "review_at": "/admin/holds",
            "note": "HOLD is the only screening step that needs an admin",
        },
        "configuration": config.describe(),
        "generated_at": utcnow_iso(),
    }, "Dashboard")


# ===========================================================================
# Job descriptions
#
# /admin/jds/create is declared before /admin/jds/{jd_id} so the literal path
# can never be captured by the path parameter.
# ===========================================================================

@router.get("/jds")
def list_jds(p: Principal = Depends(require_admin)):
    jds = db.list_org_jds(p.org_id)
    jds.sort(key=lambda j: j.get("created_at") or "", reverse=True)
    rows = [_jd_view(j, len(db.list_questions_for_jd(j["jd_id"]))) for j in jds]
    return ok({"count": len(rows), "jobs": rows}, "Jobs")


@router.get("/jds/create")
def create_jd(
    title: str = Query(..., min_length=2, max_length=200),
    description: str = Query(..., min_length=20, max_length=8000),
    interviewer_id: str = Query(..., description="must be an interviewer in your organization"),
    screening_threshold: int = Query(70, ge=0, le=100),
    exam_threshold: int = Query(60, ge=0, le=100),
    expiry: Optional[str] = Query(None, description="2026-12-31 or an ISO-8601 timestamp"),
    p: Principal = Depends(require_admin),
):
    """
    Create a job as a DRAFT.

    The interviewer is chosen here and never changes: there is no assignment
    step, no slots and no scheduling anywhere in the system. Add the questions
    with /admin/jds/{jd_id}/questions/create, then publish.
    """
    org = db.get_org(p.org_id)
    if not org:
        raise HTTPException(404, "organization not found")

    interviewer = db.get_user(interviewer_id)
    if (not interviewer or interviewer.get("org_id") != p.org_id
            or interviewer.get("role") != Role.INTERVIEWER.value):
        raise HTTPException(400, "that interviewer is not in your organization")

    expires_iso, expires_epoch = _resolve_expiry(expiry)
    now = utcnow_iso()
    jd = JDRow(jd_id=db.new_id("jd"), org_id=p.org_id, org_name=org["name"],
               title=title, description=description,
               interviewer_id=interviewer["user_id"],
               interviewer_name=interviewer["name"],
               screening_threshold=screening_threshold,
               exam_threshold=exam_threshold,
               expires_at=expires_iso, expires_epoch=expires_epoch,
               created_by=p.user_id, created_at=now, updated_at=now,
               is_live="false")
    db.create_jd(jd)
    db.write_audit(entity_id=jd.jd_id, action="jd.created", actor_id=p.user_id,
                   actor_role=Role.ADMIN.value, org_id=p.org_id,
                   metadata={"title": title, "interviewer_id": interviewer_id,
                             "screening_threshold": screening_threshold,
                             "exam_threshold": exam_threshold})
    return ok({**_jd_view(db.get_jd(jd.jd_id), 0),
               "next_steps": [
                   f"/admin/jds/{jd.jd_id}/questions/create?question=...&reference_answer=...&marks=10",
                   f"/admin/jds/{jd.jd_id}/publish"]},
              "Job created as a draft")


@router.get("/jds/{jd_id}")
def get_jd(jd_id: str, p: Principal = Depends(require_admin)):
    jd = _scoped_jd(jd_id, p)
    questions = db.list_questions_for_jd(jd_id)
    return ok({**_jd_view(jd, len(questions)),
               "total_marks": sum(int(q.get("marks") or 0) for q in questions)},
              "Job")


@router.get("/jds/{jd_id}/update")
def update_jd(
    jd_id: str,
    title: Optional[str] = Query(None, min_length=2, max_length=200),
    description: Optional[str] = Query(None, min_length=20, max_length=8000),
    screening_threshold: Optional[int] = Query(None, ge=0, le=100),
    exam_threshold: Optional[int] = Query(None, ge=0, le=100),
    interviewer_id: Optional[str] = Query(None),
    p: Principal = Depends(require_admin),
):
    """Edit a job. Use /extend-expiry for the deadline."""
    _scoped_jd(jd_id, p)
    updates: dict = {"updated_at": utcnow_iso()}
    if title is not None:
        updates["title"] = title
    if description is not None:
        updates["description"] = description
    if screening_threshold is not None:
        updates["screening_threshold"] = screening_threshold
    if exam_threshold is not None:
        updates["exam_threshold"] = exam_threshold
    if interviewer_id is not None:
        interviewer = db.get_user(interviewer_id)
        if (not interviewer or interviewer.get("org_id") != p.org_id
                or interviewer.get("role") != Role.INTERVIEWER.value):
            raise HTTPException(400, "that interviewer is not in your organization")
        updates["interviewer_id"] = interviewer["user_id"]
        updates["interviewer_name"] = interviewer["name"]
    if len(updates) == 1:
        raise HTTPException(400, "nothing to update: pass at least one parameter")

    result = db.update_jd(jd_id, p.org_id, updates)
    if result is None:
        raise HTTPException(404, "job not found")
    db.write_audit(entity_id=jd_id, action="jd.updated", actor_id=p.user_id,
                   actor_role=Role.ADMIN.value, org_id=p.org_id,
                   metadata={"fields": sorted(k for k in updates if k != "updated_at")})
    return ok(_jd_view(result), "Job updated")


@router.get("/jds/{jd_id}/delete")
def delete_jd(jd_id: str, p: Principal = Depends(require_admin)):
    """Take the job down for good. The row is retained, because its
    applications are evidence, but it disappears from every candidate path."""
    _scoped_jd(jd_id, p)
    result = db.update_jd(jd_id, p.org_id,
                          {"deleted": True, "is_live": "false",
                           "updated_at": utcnow_iso()})
    if result is None:
        raise HTTPException(404, "job not found")
    db.write_audit(entity_id=jd_id, action="jd.deleted", actor_id=p.user_id,
                   actor_role=Role.ADMIN.value, org_id=p.org_id)
    return ok({"jd_id": jd_id, "state": jd_state(result)}, "Job deleted")


@router.get("/jds/{jd_id}/publish")
def publish_jd(jd_id: str, p: Principal = Depends(require_admin)):
    jd = _scoped_jd(jd_id, p)
    if not db.list_questions_for_jd(jd_id):
        raise HTTPException(409, "add at least one question before publishing")
    if jd_is_expired(jd):
        raise HTTPException(409, "this job has expired; extend the expiry first")

    updates = {"is_live": "true", "updated_at": utcnow_iso()}
    # posted_at is the range key of the public feed index, so it is stamped
    # once and never overwritten by a later re-publish.
    if not jd.get("posted_at"):
        updates["posted_at"] = utcnow_iso()
    result = db.update_jd(jd_id, p.org_id, updates)
    db.write_audit(entity_id=jd_id, action="jd.published", actor_id=p.user_id,
                   actor_role=Role.ADMIN.value, org_id=p.org_id)
    return ok(_jd_view(result), "Job published")


@router.get("/jds/{jd_id}/unpublish")
def unpublish_jd(jd_id: str, p: Principal = Depends(require_admin)):
    _scoped_jd(jd_id, p)
    result = db.update_jd(jd_id, p.org_id,
                          {"is_live": "false", "updated_at": utcnow_iso()})
    db.write_audit(entity_id=jd_id, action="jd.unpublished", actor_id=p.user_id,
                   actor_role=Role.ADMIN.value, org_id=p.org_id)
    return ok(_jd_view(result), "Job unpublished")


@router.get("/jds/{jd_id}/extend-expiry")
def extend_expiry(jd_id: str,
                  expiry: str = Query(..., description="2027-01-30 or an ISO-8601 timestamp"),
                  p: Principal = Depends(require_admin)):
    """Push the deadline out. This is how an expired job comes back."""
    _scoped_jd(jd_id, p)
    iso, epoch = _resolve_expiry(expiry)
    result = db.update_jd(jd_id, p.org_id,
                          {"expires_at": iso, "expires_epoch": epoch,
                           "updated_at": utcnow_iso()})
    if result is None:
        raise HTTPException(404, "job not found")
    db.write_audit(entity_id=jd_id, action="jd.expiry_extended",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id, metadata={"expires_at": iso})
    return ok(_jd_view(result), "Expiry updated")


# ===========================================================================
# Questions - free text, with a reference answer and a mark allocation
# ===========================================================================

@router.get("/jds/{jd_id}/questions")
def list_questions(jd_id: str, p: Principal = Depends(require_admin)):
    """The admin sees the reference answers. The candidate never does."""
    _scoped_jd(jd_id, p)
    rows = db.list_questions_for_jd(jd_id)
    return ok({"count": len(rows),
               "total_marks": sum(int(q.get("marks") or 0) for q in rows),
               "questions": rows}, "Questions")


@router.get("/jds/{jd_id}/questions/create")
def create_question(
    jd_id: str,
    question: str = Query(..., min_length=5, max_length=2000),
    reference_answer: str = Query(..., min_length=5, max_length=4000),
    marks: int = Query(10, ge=1, le=100),
    p: Principal = Depends(require_admin),
):
    _scoped_jd(jd_id, p)
    existing = db.list_questions_for_jd(jd_id)
    if len(existing) >= 50:
        raise HTTPException(409, "a job can hold at most 50 questions")
    q = QuestionRow(question_id=db.new_id("q"), jd_id=jd_id, org_id=p.org_id,
                    question=question, reference_answer=reference_answer,
                    marks=marks, created_by=p.user_id, created_at=utcnow_iso(),
                    order=len(existing))
    db.create_question(q)
    db.write_audit(entity_id=jd_id, action="question.created",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id,
                   metadata={"question_id": q.question_id, "marks": marks})
    return ok(q.model_dump(mode="json"), "Question added")


@router.get("/questions/{question_id}/update")
def update_question(
    question_id: str,
    question: Optional[str] = Query(None, min_length=5, max_length=2000),
    reference_answer: Optional[str] = Query(None, min_length=5, max_length=4000),
    marks: Optional[int] = Query(None, ge=1, le=100),
    p: Principal = Depends(require_admin),
):
    existing = db.get_question(question_id)
    if not existing or existing.get("org_id") != p.org_id:
        raise HTTPException(404, "question not found")
    updates = {k: v for k, v in
               (("question", question), ("reference_answer", reference_answer),
                ("marks", marks)) if v is not None}
    if not updates:
        raise HTTPException(400, "nothing to update: pass at least one parameter")
    result = db.update_question(question_id, p.org_id, updates)
    if result is None:
        raise HTTPException(404, "question not found")
    db.write_audit(entity_id=existing["jd_id"], action="question.updated",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id,
                   metadata={"question_id": question_id,
                             "fields": sorted(updates)})
    return ok(result, "Question updated")


@router.get("/questions/{question_id}/delete")
def delete_question(question_id: str, p: Principal = Depends(require_admin)):
    existing = db.get_question(question_id)
    if not existing or existing.get("org_id") != p.org_id:
        raise HTTPException(404, "question not found")
    if not db.delete_question(question_id, p.org_id):
        raise HTTPException(404, "question not found")
    db.write_audit(entity_id=existing["jd_id"], action="question.deleted",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id, metadata={"question_id": question_id})
    return ok({"question_id": question_id}, "Question deleted")


# ===========================================================================
# Screening: the hold queue and the manual re-screen
# ===========================================================================

@router.get("/holds")
def list_holds(jd_id: Optional[str] = Query(None),
               p: Principal = Depends(require_admin)):
    """
    Borderline resumes waiting on a human. This is the ONLY manual step in
    screening: a clear pass or a clear reject never lands here.
    """
    jds = [_scoped_jd(jd_id, p)] if jd_id else db.list_org_jds(p.org_id)
    held = []
    for jd in jds:
        for a in db.query_apps_by_jd(jd["jd_id"],
                                     status=ApplicationStatus.HOLD.value):
            ai = a.get("resume_ai") or {}
            held.append({
                "app_id": a["app_id"], "jd_id": jd["jd_id"],
                "job_title": jd.get("title"),
                "candidate_id": a.get("candidate_id"),
                "candidate_name": a.get("candidate_name"),
                "candidate_email": a.get("candidate_email"),
                "resume_score": a.get("resume_score"),
                "screening_threshold": a.get("screening_threshold"),
                "hold_band": config.screening_hold_band(),
                "summary": ai.get("summary"),
                "matched_skills": ai.get("matched_skills", []),
                "missing_skills": ai.get("missing_skills", []),
                "experience_match": ai.get("experience_match"),
                "confidence": ai.get("confidence"),
                "red_flags": ai.get("red_flags", []),
                "applied_at": a.get("created_at"),
                "screened_at": a.get("resume_scored_at"),
                "approve": f"/admin/applications/{a['app_id']}/hold/approve",
                "reject": f"/admin/applications/{a['app_id']}/hold/reject",
            })
    held.sort(key=lambda h: (h["resume_score"] is None, h["resume_score"] or 0))
    return ok({"count": len(held), "holds": held}, "Screening holds")


def _resolve_hold(app_id: str, approve: bool, p: Principal) -> dict:
    """
    Shared by both hold decisions.

    Idempotent: if the application has already reached the outcome being asked
    for, this reports success without transitioning again.
    """
    app_ = _scoped_app(app_id, p)
    target = (ApplicationStatus.SCREENING_PASSED if approve
              else ApplicationStatus.REJECTED)
    if app_["status"] == target.value:
        return ok({"app_id": app_id, "status": target.value,
                   "already_applied": True,
                   "exam_id": app_.get("exam_id")},
                  "That decision was already recorded")
    if app_["status"] != ApplicationStatus.HOLD.value:
        raise HTTPException(
            409, f"only a held application can be reviewed; this one is {app_['status']}")

    extra = {}
    if approve:
        # Clearing screening is what makes the exam reachable. There is no
        # separate unlock step anywhere in the system.
        extra["exam_id"] = exam_id_for(app_id)
    extra.update({"screening_reviewed_by": p.user_id,
                  "screening_reviewed_at": utcnow_iso()})
    try:
        moved = db.transition_status(app_id, target, extra_updates=extra)
    except ValueError as e:
        raise HTTPException(409, str(e))
    if moved is None:
        current = (db.get_application(app_id) or {}).get("status")
        if current == target.value:
            return ok({"app_id": app_id, "status": current, "already_applied": True},
                      "That decision was already recorded")
        raise HTTPException(409, "the application changed while you were deciding, retry")

    db.write_audit(entity_id=app_id,
                   action="screening.hold_approved" if approve else "screening.hold_rejected",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id, from_state=ApplicationStatus.HOLD.value,
                   to_state=target.value,
                   metadata={"resume_score": app_.get("resume_score")})
    return ok({"app_id": app_id, "status": target.value,
               "exam_id": moved.get("exam_id"),
               "exam_unlocked": approve},
              "Candidate may now sit the exam" if approve else "Application rejected")


@router.get("/applications/{app_id}/hold/approve")
def approve_hold(app_id: str, p: Principal = Depends(require_admin)):
    """HOLD -> SCREENING_PASSED. The candidate can sit the exam immediately."""
    return _resolve_hold(app_id, True, p)


@router.get("/applications/{app_id}/hold/reject")
def reject_hold(app_id: str, p: Principal = Depends(require_admin)):
    """HOLD -> REJECTED. The exam stays closed."""
    return _resolve_hold(app_id, False, p)


@router.get("/jds/{jd_id}/screen")
def rescreen(jd_id: str, p: Principal = Depends(require_admin)):
    """
    Re-screen the applications that can be re-screened.

    Screening is automatic on apply; this exists only for applications that
    never started (NEW) or were rejected and deserve another look after the
    job description was improved. It does not replace automatic screening.
    """
    _scoped_jd(jd_id, p)
    queue_url = _screening_queue_url()
    if not queue_url:
        raise HTTPException(503, "the screening queue is not configured")

    eligible = [a for a in db.query_apps_by_jd(jd_id)
                if a["status"] in (ApplicationStatus.NEW.value,
                                   ApplicationStatus.REJECTED.value)]
    if not eligible:
        raise HTTPException(
            400, "nothing to re-screen: applications are screened automatically "
                 "when the candidate applies, and only NEW or REJECTED rows can "
                 "be queued again")

    batch_id = db.new_id("batch")
    now = utcnow_iso()
    queued = 0
    for a in eligible:
        job_id = db.new_id("job")
        db.create_job(JobRow(job_id=job_id, batch_id=batch_id,
                             job_type="resume_match", app_id=a["app_id"],
                             org_id=p.org_id, status=JobStatus.QUEUED,
                             created_at=now, updated_at=now,
                             expires_at=db.ttl_from_now(24 * 3600)))
        SQS.send_message(QueueUrl=queue_url,
                         MessageBody=json.dumps({"job_id": job_id,
                                                 "app_id": a["app_id"]}))
        queued += 1

    db.write_audit(entity_id=jd_id, action="screening.rescreen_batch",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id,
                   metadata={"batch_id": batch_id, "queued": queued})
    return ok({"batch_id": batch_id, "queued": queued,
               "poll": f"/admin/jobs/batch/{batch_id}"},
              f"Re-screening {queued} application(s)")


# ===========================================================================
# Applications
# ===========================================================================

@router.get("/jds/{jd_id}/applications")
def applications_for_jd(
    jd_id: str,
    status: Optional[str] = Query(None),
    sort_by: str = Query("combined_score",
                         pattern="^(combined_score|resume_score|exam_score|integrity_score|created_at|updated_at)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    p: Principal = Depends(require_admin),
):
    _scoped_jd(jd_id, p)
    if status and status not in {s.value for s in ApplicationStatus}:
        raise HTTPException(400, "unknown status")
    apps = db.query_apps_by_jd(jd_id, status=status)
    # None sorts last in desc order, so an unscored row never tops the list.
    apps.sort(key=lambda a: (a.get(sort_by) is None, a.get(sort_by) or 0),
              reverse=(order == "desc"))
    rows = [{
        "app_id": a["app_id"], "candidate_name": a.get("candidate_name"),
        "candidate_email": a.get("candidate_email"),
        "status": a.get("status"),
        "resume_score": a.get("resume_score"),
        "exam_score": a.get("exam_score"),
        "integrity_score": a.get("integrity_score"),
        "combined_score": a.get("combined_score"),
        "decision": a.get("decision"),
        "auto_flagged": bool(a.get("auto_flagged")),
        "applied_at": a.get("created_at"),
    } for a in apps]
    return ok({"jd_id": jd_id, "count": len(rows), "sort_by": sort_by,
               "order": order, "applications": rows}, "Applications")


@router.get("/applications/{app_id}")
def application_detail(app_id: str, p: Principal = Depends(require_admin)):
    """
    The full evidence bundle. The admin can inspect everything but does not
    make the hiring decision: that belongs to the assigned interviewer.
    """
    app_ = _scoped_app(app_id, p)
    questions = {q["question_id"]: q for q in db.list_questions_for_jd(app_["jd_id"])}
    answers = []
    for a in db.list_answers(app_id):
        q = questions.get(a["question_id"], {})
        answers.append({
            "question_id": a["question_id"],
            "question": q.get("question"),
            "reference_answer": q.get("reference_answer"),
            "answer_text": a.get("answer_text"),
            "marks_awarded": a.get("marks_awarded"),
            "max_marks": a.get("max_marks", q.get("marks")),
            "feedback": a.get("feedback"),
        })
    return ok({
        "application": app_,
        "resume_url": db.presign_resume(app_.get("resume_s3_key", "")),
        "answers": answers,
        "proctoring_events": db.list_proctor_events(app_id),
        "audit": db.list_audit(app_id, limit=200),
        "decision_belongs_to": app_.get("assigned_interviewer_name"),
    }, "Application detail")


# ===========================================================================
# Interviewers - create and delete only
# ===========================================================================

@router.get("/interviewers")
def list_interviewers(p: Principal = Depends(require_admin)):
    rows = db.list_org_interviewers(p.org_id)
    return ok({"count": len(rows),
               "interviewers": [{"user_id": r["user_id"], "name": r["name"],
                                 "email": r["email"],
                                 "created_at": r.get("created_at")}
                                for r in rows]}, "Interviewers")


@router.get("/interviewers/create")
def create_interviewer(email: str = Query(...), password: str = Query(...),
                       name: Optional[str] = Query(None, max_length=100),
                       p: Principal = Depends(require_admin)):
    """
    Interviewers never sign themselves up. The admin creates the account and
    hands over the password; the interviewer then signs in at /auth/login.
    The organization always comes from the admin's session, never from a
    parameter.
    """
    email = clean_email(email)
    check_password(password)
    if db.get_user_by_email(email):
        raise HTTPException(409, "an account with this email already exists")

    user = UserRow(user_id=db.new_id("usr"), email=email,
                   password_hash=hash_password(password),
                   role=Role.INTERVIEWER, name=name or email.split("@")[0],
                   org_id=p.org_id, created_at=utcnow_iso())
    db.create_user(user)
    db.write_audit(entity_id=p.org_id, action="interviewer.created",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id,
                   metadata={"user_id": user.user_id, "email": email})
    return ok({"user_id": user.user_id, "email": user.email, "name": user.name,
               "org_id": p.org_id, "created_at": user.created_at},
              "Interviewer created")


@router.get("/interviewers/{user_id}/delete")
def delete_interviewer(user_id: str, p: Principal = Depends(require_admin)):
    """
    Remove an interviewer. Refused while they are still the interviewer on a
    job that is not finished, because every application needs someone who can
    decide it.
    """
    target = db.get_user(user_id)
    if (not target or target.get("org_id") != p.org_id
            or target.get("role") != Role.INTERVIEWER.value):
        raise HTTPException(404, "interviewer not found in your organization")

    live_jds = [j for j in db.list_org_jds(p.org_id)
                if j.get("interviewer_id") == user_id]
    if live_jds:
        raise HTTPException(
            409,
            "this interviewer is assigned to "
            f"{len(live_jds)} job(s); point those jobs at someone else first "
            "with /admin/jds/{jd_id}/update?interviewer_id=...")

    if not db.delete_user(user_id, p.org_id):
        raise HTTPException(404, "interviewer not found in your organization")
    db.write_audit(entity_id=p.org_id, action="interviewer.deleted",
                   actor_id=p.user_id, actor_role=Role.ADMIN.value,
                   org_id=p.org_id, metadata={"user_id": user_id})
    return ok({"user_id": user_id}, "Interviewer deleted")


# ===========================================================================
# Background jobs
#
# /admin/jobs/failed is declared before /admin/jobs/batch/{batch_id} so the
# literal path is never captured by the parameter.
# ===========================================================================

@router.get("/jobs/failed")
def failed_jobs(p: Principal = Depends(require_admin)):
    """Jobs that failed every delivery. Re-run a screening with
    /admin/jds/{jd_id}/screen."""
    rows = db.list_jobs_by_org_status(p.org_id, JobStatus.FAILED.value)
    return ok({"count": len(rows), "failed_jobs": rows}, "Failed jobs")


@router.get("/jobs/batch/{batch_id}")
def batch_progress(batch_id: str, p: Principal = Depends(require_admin)):
    jobs = db.list_batch_jobs(batch_id)
    if not jobs or any(j.get("org_id") != p.org_id for j in jobs):
        raise HTTPException(404, "batch not found")
    counts = {s.value: 0 for s in JobStatus}
    for j in jobs:
        if j.get("status") in counts:
            counts[j["status"]] += 1
    return ok({"batch_id": batch_id, "total": len(jobs), **counts,
               "finished": counts["queued"] == 0 and counts["running"] == 0},
              "Batch progress")


# ===========================================================================
# Audit and flags
# ===========================================================================

@router.get("/audit/{entity_id}")
def audit(entity_id: str, limit: int = Query(100, ge=1, le=500),
          p: Principal = Depends(require_admin)):
    """The trail for one entity inside this organization: the org itself, or
    one of its jobs, applications, questions or users."""
    if entity_id != p.org_id:
        owners = (db.get_application(entity_id), db.get_jd(entity_id),
                  db.get_question(entity_id), db.get_user(entity_id))
        if not any(o and o.get("org_id") == p.org_id for o in owners):
            raise HTTPException(404, "not found in your organization")
    return ok({"entity_id": entity_id, "events": db.list_audit(entity_id, limit)},
              "Audit trail")


@router.get("/flags")
def flags(p: Principal = Depends(require_admin)):
    """Auto-flagged applications. Flags are advisory and never change a
    status by themselves."""
    flagged = []
    for jd in db.list_org_jds(p.org_id):
        for a in db.query_apps_by_jd(jd["jd_id"]):
            if a.get("auto_flagged"):
                flagged.append({
                    "app_id": a["app_id"], "jd_id": jd["jd_id"],
                    "job_title": jd.get("title"),
                    "candidate_name": a.get("candidate_name"),
                    "status": a.get("status"),
                    "resume_score": a.get("resume_score"),
                    "exam_score": a.get("exam_score"),
                    "integrity_score": a.get("integrity_score"),
                    "combined_score": a.get("combined_score"),
                    "reasons": a.get("auto_flag_reasons", []),
                })
    return ok({"count": len(flagged), "applications": flagged},
              "Auto-flagged applications")
