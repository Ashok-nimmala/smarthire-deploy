"""
interviewer.py
--------------
The interviewer's whole world: the applications assigned to them, and the one
decision only they can make.

Three conditions are checked on every application route, and all three must
hold: the session's role is interviewer, the application's org is theirs, and
the application's assigned interviewer IS them. Otherwise 404 - an interviewer
cannot even confirm that another interviewer's application exists.

The interviewer is chosen when the job is created, so there is no assignment,
no slot and no scheduling anywhere in this file.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

import db
from auth import Principal, require_interviewer
from models import (
    ApplicationStatus,
    Role,
    ok,
    utcnow_iso,
)

router = APIRouter(prefix="/interviewer", tags=["interviewer"],
                   dependencies=[Depends(require_interviewer)])

DECISIONS = {"ACCEPTED": ApplicationStatus.ACCEPTED,
             "FINAL_REJECTED": ApplicationStatus.FINAL_REJECTED}

# Rejected by the system before the interview stage, so never this
# interviewer's business. The assigned interviewer is copied onto every
# application when the job is created, which used to put candidates rejected at
# screening into their queue as well.
#
# FINAL_REJECTED is deliberately NOT here: that one is this interviewer's own
# recorded decision. Hiding it would erase their own history, the dashboard's
# rejected count and the note they wrote.
HIDDEN_FROM_INTERVIEWER = frozenset({
    ApplicationStatus.REJECTED.value,
    ApplicationStatus.EXAM_REJECTED.value,
})


def _assigned(app_id: str, p: Principal) -> dict:
    app_ = db.get_application(app_id)
    if (not app_ or app_.get("org_id") != p.org_id
            or app_.get("assigned_interviewer") != p.user_id
            or app_.get("status") in HIDDEN_FROM_INTERVIEWER):
        # Same answer for "does not exist", "not yours" and "rejected before it
        # reached you", so nothing can be inferred from the difference.
        raise HTTPException(404, "that application is not assigned to you")
    return app_


def _row(a: dict) -> dict:
    """The summary card used by both the list and the dashboard."""
    return {
        "app_id": a["app_id"],
        "candidate_name": a.get("candidate_name"),
        "candidate_email": a.get("candidate_email"),
        "job_title": a.get("jd_title"),
        "jd_id": a.get("jd_id"),
        "status": a.get("status"),
        "resume_score": a.get("resume_score"),
        "exam_score": a.get("exam_score"),
        "integrity_score": a.get("integrity_score"),
        "combined_score": a.get("combined_score"),
        "decision": a.get("decision"),
        "auto_flagged": bool(a.get("auto_flagged")),
        "auto_flag_reasons": a.get("auto_flag_reasons", []),
        "applied_at": a.get("created_at"),
        "updated_at": a.get("updated_at"),
    }


def _mine(p: Principal) -> list[dict]:
    apps = db.query_apps_by_interviewer(p.user_id)
    # The index is eventually consistent, so re-check the tenant defensively.
    # Candidates the system rejected never reach the interviewer at all.
    return [a for a in apps
            if a.get("org_id") == p.org_id
            and a.get("status") not in HIDDEN_FROM_INTERVIEWER]


@router.get("/dashboard")
def dashboard(p: Principal = Depends(require_interviewer)):
    apps = _mine(p)
    pending = [a for a in apps
               if a.get("status") == ApplicationStatus.INTERVIEW_PENDING.value]
    decided = [a for a in apps if a.get("decision")]
    user = db.get_user(p.user_id) or {}
    return ok({
        "profile": {"user_id": p.user_id, "name": user.get("name"),
                    "email": user.get("email")},
        "counts": {
            "assigned_total": len(apps),
            "pending_decisions": len(pending),
            "accepted": sum(1 for a in decided if a.get("decision") == "ACCEPTED"),
            "rejected": sum(1 for a in decided
                            if a.get("decision") == "FINAL_REJECTED"),
        },
        # Weakest first is not useful here: the interviewer wants the strongest
        # candidates at the top of the queue.
        "pending_decisions": sorted(
            (_row(a) for a in pending),
            key=lambda r: r["combined_score"] or 0, reverse=True),
        "recently_decided": sorted(
            (_row(a) for a in decided),
            key=lambda r: r.get("updated_at") or "", reverse=True)[:10],
        "generated_at": utcnow_iso(),
    }, "Dashboard")


@router.get("/applications")
def list_applications(p: Principal = Depends(require_interviewer)):
    """Every application assigned to this interviewer, the ones still waiting
    on a decision first."""
    rows = [_row(a) for a in _mine(p)]
    rows.sort(key=lambda r: (r["status"] != ApplicationStatus.INTERVIEW_PENDING.value,
                             -(r["combined_score"] or 0)))
    return ok({"count": len(rows), "applications": rows}, "Assigned applications")


@router.get("/applications/{app_id}")
def application_detail(app_id: str, p: Principal = Depends(require_interviewer)):
    """
    Everything needed to judge the candidate, including the reference answers.
    The candidate never sees those; the interviewer needs them to mark.
    """
    app_ = _assigned(app_id, p)
    jd = db.get_jd(app_["jd_id"]) or {}
    questions = {q["question_id"]: q for q in db.list_questions_for_jd(app_["jd_id"])}
    answers = []
    for a in sorted(db.list_answers(app_id), key=lambda x: x["question_id"]):
        q = questions.get(a["question_id"], {})
        answers.append({
            "question_id": a["question_id"],
            "question": q.get("question"),
            "reference_answer": q.get("reference_answer"),
            "candidate_answer": a.get("answer_text"),
            "marks_awarded": a.get("marks_awarded"),
            "max_marks": a.get("max_marks", q.get("marks")),
            "ai_feedback": a.get("feedback"),
            "submitted_at": a.get("submitted_at"),
        })
    answered = {a["question_id"] for a in answers}
    return ok({
        "application": _row(app_),
        "candidate": {
            "name": app_.get("candidate_name"),
            "email": app_.get("candidate_email"),
        },
        "job": {"jd_id": jd.get("jd_id"), "title": jd.get("title"),
                "description": jd.get("description"),
                "exam_threshold": jd.get("exam_threshold"),
                "screening_threshold": jd.get("screening_threshold")},
        "resume": {
            "download_url": db.presign_resume(app_.get("resume_s3_key", "")),
            "url_expires_in_seconds": 900,
            "text": app_.get("resume_text"),
        },
        "screening_result": app_.get("resume_ai"),
        "exam": {
            "questions_total": len(questions),
            "answered": len(answered),
            "unanswered": len(questions) - len(answered),
            "marks_awarded": app_.get("exam_marks_awarded"),
            "marks_possible": app_.get("exam_marks_possible"),
            "score_percent": app_.get("exam_score"),
            "submitted_at": app_.get("exam_submitted_at"),
            "answers": answers,
        },
        "integrity": {
            "score": app_.get("integrity_score"),
            "events": db.list_proctor_events(app_id),
        },
        "auto_flags": app_.get("auto_flag_reasons", []),
        "decision": {
            "current": app_.get("decision"),
            "can_decide": app_["status"] == ApplicationStatus.INTERVIEW_PENDING.value,
            "accept": f"/interviewer/applications/{app_id}/decision?decision=ACCEPTED&note=...",
            "reject": f"/interviewer/applications/{app_id}/decision?decision=FINAL_REJECTED&note=...",
        },
    }, "Application detail")


# ---------------------------------------------------------------------------
# Notes - append-only, so an interview record is never rewritten.
#
# /notes/add is declared before /notes so neither path can shadow the other.
# ---------------------------------------------------------------------------

@router.get("/applications/{app_id}/notes/add")
def add_note(app_id: str, note: str = Query(..., min_length=1, max_length=2000),
             p: Principal = Depends(require_interviewer)):
    _assigned(app_id, p)
    db.bump_notes_count(app_id)
    db.write_audit(entity_id=app_id, action="interviewer.note",
                   actor_id=p.user_id, actor_role=Role.INTERVIEWER.value,
                   org_id=p.org_id, metadata={"note": note})
    return ok({"app_id": app_id, "at": utcnow_iso()}, "Note added")


@router.get("/applications/{app_id}/notes")
def list_notes(app_id: str, limit: int = Query(200, ge=1, le=500),
               p: Principal = Depends(require_interviewer)):
    _assigned(app_id, p)
    notes = [{
        "at": e["ts_event"].split("#")[0],
        "by": e.get("actor_id"),
        "action": e.get("action"),
        "note": (e.get("metadata") or {}).get("note"),
        "decision": (e.get("metadata") or {}).get("decision"),
    } for e in db.list_audit(app_id, limit=limit)
        if e.get("action") in ("interviewer.note", "interviewer.decision")]
    return ok({"count": len(notes), "notes": notes}, "Notes")


# ---------------------------------------------------------------------------
# The final decision. Nobody else in the system can make it.
# ---------------------------------------------------------------------------

@router.get("/applications/{app_id}/decision")
def decide(app_id: str,
           decision: str = Query(..., pattern="^(ACCEPTED|FINAL_REJECTED)$"),
           note: str = Query(..., min_length=1, max_length=2000),
           p: Principal = Depends(require_interviewer)):
    """
    ACCEPTED or FINAL_REJECTED, from INTERVIEW_PENDING, once.

    The note is required: a decision without a reason is not auditable.
    """
    app_ = _assigned(app_id, p)
    if app_.get("decision"):
        raise HTTPException(
            409, f"this application was already decided: {app_['decision']}")
    if app_["status"] != ApplicationStatus.INTERVIEW_PENDING.value:
        raise HTTPException(
            409,
            f"a decision can only be made once the candidate reaches the "
            f"interview stage; this application is {app_['status']}")

    now = utcnow_iso()
    try:
        moved = db.transition_status(app_id, DECISIONS[decision], extra_updates={
            "decision": decision, "decision_by": p.user_id, "decision_at": now})
    except ValueError as e:
        raise HTTPException(409, str(e))
    if moved is None:
        raise HTTPException(409, "the application changed while you were deciding, retry")

    db.bump_notes_count(app_id)
    db.write_audit(entity_id=app_id, action="interviewer.decision",
                   actor_id=p.user_id, actor_role=Role.INTERVIEWER.value,
                   org_id=p.org_id,
                   from_state=ApplicationStatus.INTERVIEW_PENDING.value,
                   to_state=decision,
                   metadata={"decision": decision, "note": note})
    return ok({"app_id": app_id, "decision": decision, "status": decision,
               "decided_at": now}, f"Decision recorded: {decision}")
