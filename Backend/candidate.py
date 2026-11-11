"""
candidate.py
------------
The public job feed and everything a signed-in candidate can do.

Public (no session):
  GET /public/jobs
  GET /public/search?q=
  GET /public/jobs/{jd_id}

Candidate (session, role=candidate):
  GET  /candidate/dashboard
  GET  /candidate/me
  GET  /candidate/me/update?name=...
  POST /candidate/me/resume              <- the one POST in the whole API
  GET  /candidate/me/applications
  GET  /candidate/apply/{jd_id}
  GET  /candidate/me/applications/{app_id}

Guarantees:
- A candidate never sees a reference answer, an AI red flag, a screening
  threshold, the interviewer's name, or another candidate's anything.
- A foreign app_id answers 404, never 403, so ids cannot be probed.
- The public feed and every by-id path refuse an unpublished, deleted or
  EXPIRED job, so a saved link cannot outlive the deadline.
"""

from __future__ import annotations

import io
import json
import os
import uuid
from typing import Optional

import boto3
from fastapi import (APIRouter, Depends, File, HTTPException, Query, Request,
                     UploadFile)

import cache
import config
import db
from auth import Principal, require_candidate
from models import (
    CANDIDATE_MESSAGE,
    IN_PROGRESS_STATUSES,
    ApplicationRow,
    ApplicationStatus,
    JobRow,
    JobStatus,
    Role,
    ok,
    jd_is_open,
    utcnow_iso,
)

public_router = APIRouter(prefix="/public", tags=["public"])
candidate_router = APIRouter(prefix="/candidate", tags=["candidate"])

SQS = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-south-1"))


def _screening_queue_url() -> str:
    return os.environ.get("SQS_SCREENING_URL", "")


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _public_view(jd: dict, question_count: Optional[int] = None,
                 total_marks: Optional[int] = None) -> dict:
    """
    Only what a stranger may see.

    Deliberately absent: both thresholds, the interviewer, the AI settings and
    anything internal (spec section 24).
    """
    view = {
        "jd_id": jd["jd_id"], "title": jd.get("title"),
        "organization": jd.get("org_name"),
        "description": jd.get("description"),
        "posted_at": jd.get("posted_at"),
        "expires_at": jd.get("expires_at"),
    }
    if question_count is not None:
        view["question_count"] = question_count
    if total_marks is not None:
        view["total_marks"] = total_marks
    return view


def _open_jd_or_404(jd_id: str) -> dict:
    jd = db.get_jd(jd_id)
    if not jd_is_open(jd):
        raise HTTPException(404, "this job is not open")
    return jd


def _own_app(app_id: str, p: Principal) -> dict:
    app_ = db.get_application(app_id)
    if not app_ or app_.get("candidate_id") != p.user_id:
        raise HTTPException(404, "application not found")
    return app_


# ===========================================================================
# Public
# ===========================================================================

@public_router.get("/jobs")
def public_jobs(request: Request, limit: int = Query(50, ge=1, le=100)):
    """Live, non-expired jobs, newest first."""
    if not cache.check_rate(f"pub:{_client_ip(request)}",
                            limit=config.public_reads_per_minute(),
                            window_seconds=60):
        raise HTTPException(429, "too many requests, slow down")
    items, _ = db.list_public_live_jds(limit=limit)
    return ok({"count": len(items), "jobs": [_public_view(j) for j in items]},
              "Open jobs")


@public_router.get("/search")
def public_search(request: Request,
                  q: str = Query(..., min_length=2, max_length=100),
                  limit: int = Query(20, ge=1, le=50)):
    """
    Substring search over the live feed's title, organization and description.

    ponytail: filters the newest 100 live jobs in memory. DynamoDB has no text
    search and there is no search cluster on this stack; a real index is the
    upgrade if the feed ever grows past a few hundred jobs.
    """
    if not cache.check_rate(f"search:{_client_ip(request)}",
                            limit=config.public_searches_per_minute(),
                            window_seconds=60):
        raise HTTPException(429, "too many searches, slow down")
    needle = q.lower().strip()
    pool, _ = db.list_public_live_jds(limit=100)
    hits = [_public_view(j) for j in pool
            if needle in " ".join([str(j.get("title", "")),
                                   str(j.get("org_name", "")),
                                   str(j.get("description", ""))]).lower()]
    return ok({"query": q, "count": len(hits[:limit]), "jobs": hits[:limit]},
              "Search results")


@public_router.get("/jobs/{jd_id}")
def public_job(jd_id: str):
    jd = _open_jd_or_404(jd_id)
    questions = db.list_questions_for_jd(jd_id)
    return ok(_public_view(jd, len(questions),
                           sum(int(q.get("marks") or 0) for q in questions)),
              "Job")


# ===========================================================================
# Candidate profile
# ===========================================================================

def _profile(user: dict) -> dict:
    return {
        "user_id": user["user_id"], "email": user["email"],
        "name": user.get("name"),
        "resume_uploaded": bool(user.get("resume_s3_key")),
        "resume_filename": user.get("resume_filename"),
        "resume_uploaded_at": user.get("resume_uploaded_at"),
        "resume_characters": len(user.get("resume_text") or ""),
        "created_at": user.get("created_at"),
    }


@candidate_router.get("/me")
def get_me(p: Principal = Depends(require_candidate)):
    user = db.get_user(p.user_id)
    if not user:
        raise HTTPException(404, "account not found")
    return ok(_profile(user), "Your profile")


@candidate_router.get("/me/update")
def update_me(name: str = Query(..., min_length=1, max_length=100),
              p: Principal = Depends(require_candidate)):
    user = db.update_user(p.user_id, {"name": name})
    if not user:
        raise HTTPException(404, "account not found")
    return ok(_profile(user), "Profile updated")


@candidate_router.post("/me/resume")
async def upload_resume(file: UploadFile = File(...),
                        p: Principal = Depends(require_candidate)):
    """
    Upload the resume PDF.

    The only POST in the API: a PDF cannot travel in a query string. The file
    goes to S3 and the database keeps the object key plus the text pulled out
    of it - never the PDF bytes themselves.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "that file is empty")
    if len(raw) > config.max_resume_bytes():
        raise HTTPException(
            400, f"the resume must be under {config.max_resume_bytes() // (1024*1024)} MB")
    # Trust the bytes, not the filename or the declared content type: a PDF
    # always starts with %PDF-.
    if not raw.startswith(b"%PDF-"):
        raise HTTPException(400, "only PDF resumes are accepted")

    text = _extract_pdf_text(raw)
    if len(text.strip()) < 50:
        raise HTTPException(
            400, "no readable text found in that PDF - if it is a scan, please "
                 "upload a text-based PDF so it can be screened")

    resume_id = uuid.uuid4().hex[:16]
    key = db.resume_key(p.user_id, resume_id)
    try:
        db.put_resume(key, raw)
    except Exception as e:                                   # noqa: BLE001
        print(f"resume upload failed for {p.user_id}: {type(e).__name__}: {e}")
        raise HTTPException(503, "could not store the resume, try again")

    db.update_user(p.user_id, {
        "resume_s3_key": key,
        "resume_filename": (file.filename or "resume.pdf")[:200],
        "resume_text": text[:40000],
        "resume_uploaded_at": utcnow_iso(),
    })
    db.write_audit(entity_id=p.user_id, action="resume.uploaded",
                   actor_id=p.user_id, actor_role=Role.CANDIDATE.value,
                   metadata={"bytes": len(raw), "characters": len(text)})
    return ok({"resume_uploaded": True, "filename": file.filename,
               "size_bytes": len(raw), "characters_extracted": len(text)},
              "Resume uploaded")


def _extract_pdf_text(raw: bytes) -> str:
    """Pull the text out of a PDF so the screener has something to read."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as e:                                   # noqa: BLE001
        print(f"pdf text extraction failed: {type(e).__name__}: {e}")
        return ""


# ===========================================================================
# Applications
# ===========================================================================

def _rejection(a: dict, status: str) -> Optional[dict]:
    """
    Why this application stopped, in terms the candidate can act on.

    Additive: it is None for every application that is still alive, so nothing
    an existing client reads changes shape.

    What is deliberately NOT here: the resume score, the AI's confidence, its
    red flags, the job's thresholds and the interviewer's private note. The
    candidate gets the stage, a plain reason and, for screening, the
    requirements the resume did not evidence.
    """
    if status == ApplicationStatus.REJECTED.value:
        missing = [str(m) for m in
                   ((a.get("resume_ai") or {}).get("missing_skills") or [])][:10]
        reason = ("Your resume did not match enough of what this role asks for.")
        if missing:
            reason += " The requirements it did not evidence are listed below."
        return {"stage": "SCREENING", "reason": reason,
                "missing_requirements": missing}
    if status == ApplicationStatus.EXAM_REJECTED.value:
        return {"stage": "EXAM",
                "reason": ("Your written exam score was below what this role "
                           "requires."),
                "marks_awarded": a.get("exam_marks_awarded"),
                "marks_possible": a.get("exam_marks_possible"),
                "score_percent": a.get("exam_score")}
    if status == ApplicationStatus.FINAL_REJECTED.value:
        return {"stage": "INTERVIEW",
                "reason": ("After the interview the hiring team decided not to "
                           "move forward with your application for this role."),
                "decided_at": a.get("decision_at")}
    return None


def _candidate_view(a: dict, jd: Optional[dict] = None) -> dict:
    """
    What the candidate is allowed to see about their own application.

    Their own scores are included - they earned them - but no AI evidence, no
    reference answers, no thresholds and no interviewer identity.
    """
    status = a.get("status", "NEW")
    view = {
        "app_id": a["app_id"], "jd_id": a.get("jd_id"),
        "job_title": a.get("jd_title") or (jd or {}).get("title"),
        "organization": (jd or {}).get("org_name"),
        "status": status,
        "status_message": CANDIDATE_MESSAGE.get(status, ""),
        "applied_at": a.get("created_at"),
        "updated_at": a.get("updated_at"),
        "screening": {
            "done": a.get("resume_score") is not None,
            "passed": status not in (ApplicationStatus.NEW.value,
                                     ApplicationStatus.SCREENING.value,
                                     ApplicationStatus.HOLD.value,
                                     ApplicationStatus.REJECTED.value),
        },
        "exam": {
            "eligible": bool(a.get("exam_id")),
            "exam_id": a.get("exam_id"),
            "started": bool(a.get("exam_started_at")),
            "submitted": bool(a.get("exam_submitted_at")),
            "scored": a.get("exam_score") is not None,
            "score_percent": a.get("exam_score"),
        },
        "interview": {
            "pending": status == ApplicationStatus.INTERVIEW_PENDING.value,
            "decision": a.get("decision"),
        },
        "final_result": a.get("decision") or (
            "REJECTED" if status in (ApplicationStatus.REJECTED.value,
                                     ApplicationStatus.EXAM_REJECTED.value)
            else None),
        # Why it stopped. None while the application is still alive.
        "rejection": _rejection(a, status),
    }
    if a.get("exam_id") and status == ApplicationStatus.SCREENING_PASSED.value:
        view["exam"]["how_to_start"] = (
            f"open the exam system and sign in with exam_id={a['exam_id']}")
    return view


@candidate_router.get("/me/applications")
def my_applications(p: Principal = Depends(require_candidate)):
    apps = db.query_apps_by_candidate(p.user_id)
    jds = {jid: (db.get_jd(jid) or {}) for jid in {a["jd_id"] for a in apps}}
    rows = [_candidate_view(a, jds.get(a["jd_id"])) for a in apps]
    rows.sort(key=lambda r: r.get("applied_at") or "", reverse=True)
    return ok({"count": len(rows), "applications": rows}, "Your applications")


@candidate_router.get("/apply/{jd_id}")
def apply(jd_id: str, p: Principal = Depends(require_candidate)):
    """
    Apply, and start screening automatically.

    The candidate's current resume is attached for them; there is nothing to
    pick. The response comes straight back - the AI runs on a background job,
    never inside this request.
    """
    if not cache.check_rate(f"apply:{p.user_id}",
                            limit=config.apply_rate_per_hour(),
                            window_seconds=3600):
        raise HTTPException(429, "too many applications this hour")

    jd = _open_jd_or_404(jd_id)
    user = db.get_user(p.user_id)
    if not user:
        raise HTTPException(404, "account not found")
    if not user.get("resume_s3_key") or not user.get("resume_text"):
        raise HTTPException(
            400, "upload your resume first with POST /candidate/me/resume")

    app_id = db.deterministic_app_id(jd_id, p.user_id)
    now = utcnow_iso()
    created = db.create_application_once(ApplicationRow(
        app_id=app_id, org_id=jd["org_id"], jd_id=jd_id,
        jd_title=jd.get("title", ""),
        candidate_id=p.user_id, candidate_name=user.get("name", ""),
        candidate_email=user["email"],
        resume_s3_key=user["resume_s3_key"], resume_text=user["resume_text"],
        resume_snapshot_at=now,
        status=ApplicationStatus.NEW,
        # Copied from the JD now: editing the job later must not change a
        # verdict that has already been computed.
        screening_threshold=int(jd.get("screening_threshold", 70)),
        exam_threshold=int(jd.get("exam_threshold", 60)),
        # The interviewer was chosen when the job was created.
        assigned_interviewer=jd.get("interviewer_id"),
        assigned_interviewer_name=jd.get("interviewer_name"),
        integrity_score=100, created_at=now, updated_at=now,
    ))
    if not created:
        raise HTTPException(409, "you have already applied to this job")

    db.write_audit(entity_id=app_id, action="application.created",
                   actor_id=p.user_id, actor_role=Role.CANDIDATE.value,
                   org_id=jd["org_id"], to_state=ApplicationStatus.NEW.value,
                   metadata={"jd_id": jd_id})

    queued = _queue_screening(app_id, jd["org_id"], p.user_id)
    return ok({"app_id": app_id, "jd_id": jd_id,
               "status": ApplicationStatus.NEW.value,
               "screening_queued": queued,
               "next": f"/candidate/me/applications/{app_id}"},
              "Applied. Your resume is being screened automatically.")


def _queue_screening(app_id: str, org_id: str, actor_id: str) -> bool:
    """
    Put one screening job on the queue.

    False when it could not be queued: the application survives in NEW and an
    admin can pick it up with /admin/jds/{jd_id}/screen, so a queue outage
    degrades to a manual retry instead of a lost application.
    """
    queue_url = _screening_queue_url()
    if not queue_url:
        print(f"screening queue not configured; {app_id} left in NEW")
        return False
    now = utcnow_iso()
    job_id = db.new_id("job")
    try:
        db.create_job(JobRow(job_id=job_id, batch_id=f"auto_{app_id}",
                             job_type="resume_match", app_id=app_id,
                             org_id=org_id, status=JobStatus.QUEUED,
                             created_at=now, updated_at=now,
                             expires_at=db.ttl_from_now(24 * 3600)))
        SQS.send_message(QueueUrl=queue_url,
                         MessageBody=json.dumps({"job_id": job_id,
                                                 "app_id": app_id}))
    except Exception as e:                                   # noqa: BLE001
        print(f"auto-screening could not start for {app_id}: {type(e).__name__}: {e}")
        db.update_job_status(job_id, JobStatus.FAILED.value, f"enqueue failed: {e}")
        return False
    db.write_audit(entity_id=app_id, action="screening.queued",
                   actor_id=actor_id, actor_role=Role.CANDIDATE.value,
                   org_id=org_id, metadata={"job_id": job_id})
    return True


@candidate_router.get("/me/applications/{app_id}")
def my_application(app_id: str, p: Principal = Depends(require_candidate)):
    app_ = _own_app(app_id, p)
    return ok(_candidate_view(app_, db.get_jd(app_["jd_id"])), "Application")


# ===========================================================================
# Dashboard
# ===========================================================================

@candidate_router.get("/dashboard")
def dashboard(p: Principal = Depends(require_candidate)):
    user = db.get_user(p.user_id) or {}
    apps = db.query_apps_by_candidate(p.user_id)
    jds = {jid: (db.get_jd(jid) or {}) for jid in {a["jd_id"] for a in apps}}
    views = [_candidate_view(a, jds.get(a["jd_id"])) for a in apps]
    views.sort(key=lambda r: r.get("updated_at") or "", reverse=True)

    applied_ids = {a["jd_id"] for a in apps}
    live, _ = db.list_public_live_jds(limit=20)
    recommended = [_public_view(j) for j in live if j["jd_id"] not in applied_ids][:5]

    return ok({
        "profile": _profile(user) if user else {},
        "counts": {
            "applications": len(apps),
            "in_progress": sum(1 for a in apps
                               if a.get("status") in IN_PROGRESS_STATUSES),
            "exams_to_take": sum(
                1 for a in apps
                if a.get("status") == ApplicationStatus.SCREENING_PASSED.value),
            "awaiting_result": sum(
                1 for a in apps
                if a.get("status") in (ApplicationStatus.SCREENING.value,
                                       ApplicationStatus.EXAM_SCORING.value,
                                       ApplicationStatus.INTERVIEW_PENDING.value)),
            "accepted": sum(1 for a in apps
                            if a.get("status") == ApplicationStatus.ACCEPTED.value),
        },
        "applications": views[:10],
        "recommended_jobs": recommended,
        "generated_at": utcnow_iso(),
    }, "Dashboard")
