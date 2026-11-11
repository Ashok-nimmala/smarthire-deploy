"""
models.py
---------
Every row shape, every enum, and the pure scoring functions. One file so the
schema is a single source of truth: routers import from here and never define
a shape inline.

Storage rules honoured here:
- No floats, ever. Scores, percentages and marks are ints.
- Timestamps are ISO-8601 strings in UTC.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Optional

from email_validator import EmailNotValidError, validate_email as _validate_email
from pydantic import AfterValidator, BaseModel, Field, model_validator

import config


def _normalise_email(value: str) -> str:
    """
    Validate and normalise an address, then lower-case it.

    test_environment=True permits the RFC 6761 reserved domains (.test,
    .example, .invalid), which the test data uses precisely because they can
    never belong to anyone. Genuine malformed input is still rejected.
    check_deliverability=False keeps this off the network.
    """
    try:
        result = _validate_email(str(value), check_deliverability=False,
                                 test_environment=True)
    except EmailNotValidError as e:
        raise ValueError(str(e)) from e
    return result.normalized.lower()


Email = Annotated[str, AfterValidator(_normalise_email), Field(max_length=254)]


# ============================================================================
# Enums
# ============================================================================

class Role(str, Enum):
    ADMIN = "admin"
    CANDIDATE = "candidate"
    INTERVIEWER = "interviewer"


class ApplicationStatus(str, Enum):
    """
    The whole pipeline, in order (spec section 51).

        NEW -> SCREENING -> SCREENING_PASSED | HOLD | REJECTED
        HOLD is the only screening outcome that waits for a human.
        SCREENING_PASSED -> EXAM_IN_PROGRESS -> EXAM_SCORING
                         -> EXAM_PASSED | EXAM_REJECTED
        EXAM_PASSED -> INTERVIEW_PENDING -> ACCEPTED | FINAL_REJECTED
    """
    NEW = "NEW"
    SCREENING = "SCREENING"
    HOLD = "HOLD"
    REJECTED = "REJECTED"
    SCREENING_PASSED = "SCREENING_PASSED"
    EXAM_IN_PROGRESS = "EXAM_IN_PROGRESS"
    EXAM_SCORING = "EXAM_SCORING"
    EXAM_PASSED = "EXAM_PASSED"
    EXAM_REJECTED = "EXAM_REJECTED"
    INTERVIEW_PENDING = "INTERVIEW_PENDING"
    ACCEPTED = "ACCEPTED"
    FINAL_REJECTED = "FINAL_REJECTED"


class JDState(str, Enum):
    """Derived from is_live/archived/expiry; never stored on its own."""
    DRAFT = "DRAFT"
    LIVE = "LIVE"
    UNPUBLISHED = "UNPUBLISHED"
    EXPIRED = "EXPIRED"
    DELETED = "DELETED"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


# Allowed status transitions. db.transition_status refuses anything else, so a
# status can never move along an edge that is not drawn here.
STATE_MACHINE: dict[str, set[str]] = {
    "NEW": {"SCREENING"},
    # The worker claims the application by moving it to SCREENING, so a crash
    # mid-call is visible and a redelivery can resume.
    # NEW is the recovery edge: when the AI is unreachable for every delivery,
    # the worker puts the application back where an admin can re-queue it,
    # rather than stranding it in SCREENING forever.
    "SCREENING": {"SCREENING_PASSED", "HOLD", "REJECTED", "NEW"},
    # HOLD is the only state that needs a human.
    "HOLD": {"SCREENING_PASSED", "REJECTED"},
    # A rejected application can be re-screened after the JD is improved.
    "REJECTED": {"SCREENING"},
    "SCREENING_PASSED": {"EXAM_IN_PROGRESS"},
    "EXAM_IN_PROGRESS": {"EXAM_SCORING"},
    "EXAM_SCORING": {"EXAM_PASSED", "EXAM_REJECTED"},
    # The interviewer was assigned when the JD was created, so a passed exam
    # goes straight to that interviewer's queue.
    "EXAM_PASSED": {"INTERVIEW_PENDING"},
    "INTERVIEW_PENDING": {"ACCEPTED", "FINAL_REJECTED"},
    # terminal
    "EXAM_REJECTED": set(),
    "ACCEPTED": set(),
    "FINAL_REJECTED": set(),
}

# Statuses where the candidate still has something ahead of them.
IN_PROGRESS_STATUSES = {
    "NEW", "SCREENING", "HOLD", "SCREENING_PASSED",
    "EXAM_IN_PROGRESS", "EXAM_SCORING", "EXAM_PASSED", "INTERVIEW_PENDING",
}

# What the candidate is told, per status. The candidate never sees AI evidence,
# reference answers or internal flags - only this and their own scores.
CANDIDATE_MESSAGE: dict[str, str] = {
    "NEW": "Application received",
    "SCREENING": "Your resume is being screened",
    "HOLD": "Under review by the hiring team",
    "REJECTED": "Not moving forward for this role",
    "SCREENING_PASSED": "You are eligible for the written exam",
    "EXAM_IN_PROGRESS": "Finish and submit your exam",
    "EXAM_SCORING": "Your answers are being evaluated",
    "EXAM_PASSED": "You cleared the exam",
    "EXAM_REJECTED": "Not moving forward for this role",
    "INTERVIEW_PENDING": "Waiting for the interviewer's decision",
    "ACCEPTED": "You have been selected",
    "FINAL_REJECTED": "Not moving forward for this role",
}


# ============================================================================
# Time and expiry
# ============================================================================

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(ts: Optional[str]) -> Optional[datetime]:
    """Tolerant ISO-8601 parse. A naive value is treated as UTC."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        # A plain date, as the admin would type it: 2026-12-31
        try:
            dt = datetime.strptime(str(ts), "%Y-%m-%d")
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def jd_is_expired(jd: Optional[dict], now_epoch: Optional[int] = None) -> bool:
    if not jd:
        return True
    expires = int(jd.get("expires_epoch") or 0)
    if expires <= 0:
        return False
    now = now_epoch if now_epoch is not None else int(datetime.now(timezone.utc).timestamp())
    return now >= expires


def jd_is_open(jd: Optional[dict], now_epoch: Optional[int] = None) -> bool:
    """
    True when a candidate may see or act on this job.

    Enforced in the backend on every candidate-facing path, never left to the
    frontend: unpublished, deleted and expired jobs all answer the same way.
    """
    if not jd:
        return False
    if jd.get("is_live") != "true" or jd.get("deleted"):
        return False
    return not jd_is_expired(jd, now_epoch)


def jd_state(jd: dict) -> str:
    """The admin-facing lifecycle label (spec section 15)."""
    if jd.get("deleted"):
        return JDState.DELETED.value
    if jd_is_expired(jd):
        return JDState.EXPIRED.value
    if jd.get("is_live") == "true":
        return JDState.LIVE.value
    if jd.get("posted_at"):
        return JDState.UNPUBLISHED.value
    return JDState.DRAFT.value


# ============================================================================
# The exam id
#
# The separate exam system addresses an attempt by exam_id, never by app_id, so
# the two systems keep their own vocabulary. The mapping is a prefix swap: one
# derivation, no lookup table, and no way for the two to drift apart.
# ============================================================================

def exam_id_for(app_id: str) -> str:
    return "exam_" + app_id.split("_", 1)[-1]


def app_id_for(exam_id: str) -> str:
    return "app_" + exam_id.split("_", 1)[-1]


# ============================================================================
# Scoring - pure integer arithmetic, no floats anywhere
# ============================================================================

def screening_outcome(score: int, threshold: int,
                      hold_band: Optional[int] = None) -> "ApplicationStatus":
    """
    The three-way resume verdict against the JD's own threshold:

        score >= threshold                       -> SCREENING_PASSED
        threshold - hold_band <= score           -> HOLD (borderline, admin decides)
        below that                               -> REJECTED

    The band width is platform configuration, never a frontend decision.
    """
    if hold_band is None:
        hold_band = config.screening_hold_band()
    if score >= threshold:
        return ApplicationStatus.SCREENING_PASSED
    if score >= max(0, threshold - hold_band):
        return ApplicationStatus.HOLD
    return ApplicationStatus.REJECTED


def exam_percent(marks_awarded: int, marks_possible: int) -> int:
    """Marks earned as a 0-100 int, over the WHOLE paper: an unanswered
    question costs marks rather than shrinking the exam."""
    if marks_possible <= 0:
        return 0
    return max(0, min(100, (marks_awarded * 100) // marks_possible))


def combined_score(resume_score: int, exam_pct: int, integrity: int,
                   w_resume: Optional[int] = None,
                   w_exam: Optional[int] = None) -> int:
    """
    Weighted mean of the two AI scores, scaled by the integrity multiplier:
        combined = (resume*w_r + exam*w_e) / 100 * integrity / 100
    Clamped to 0-100, so integrity 0 zeroes the result.
    """
    w_resume = config.weight_resume() if w_resume is None else w_resume
    w_exam = config.weight_exam() if w_exam is None else w_exam
    weighted = (resume_score * w_resume + exam_pct * w_exam) // 100
    return max(0, min(100, weighted * integrity // 100))


def auto_flags(resume_score: int, exam_pct: int, integrity: int,
               confidence: int) -> list[str]:
    """Advisory only. A flag never changes a status (spec section 47)."""
    flags = []
    if confidence < config.confidence_cutoff():
        flags.append("low_resume_confidence")
    if abs(resume_score - exam_pct) >= config.disagreement_cutoff():
        flags.append("resume_exam_disagreement")
    if integrity < config.integrity_flag_cutoff():
        flags.append("low_integrity_score")
    return flags


# ============================================================================
# Rows
# ============================================================================

class SessionRow(BaseModel):
    """
    A plain server-side session. No JWT, no refresh token, no blacklist: the
    row is the session and it expires on its own (spec section 4).

    session_id is the sha256 of the token handed to the client, so a dump of
    this table cannot be replayed as a login.
    """
    session_id: str
    user_id: str
    role: Role
    org_id: Optional[str] = None
    scope: str = "platform"          # "platform" or "exam"
    exam_id: Optional[str] = None    # set when scope == "exam"
    created_at: str
    expires_at: int                  # epoch seconds, DynamoDB TTL


class OrgRow(BaseModel):
    org_id: str
    name: str
    created_by: str
    created_at: str


class UserRow(BaseModel):
    """One table for all three roles. Candidates carry no org_id: they are
    cross-org by design and apply to any company's jobs."""
    user_id: str
    email: str
    password_hash: str
    role: Role
    name: str
    org_id: Optional[str] = None
    created_at: str
    active: bool = True
    # Candidate resume, stored in S3. The database keeps the reference and the
    # extracted text used for screening, never the PDF itself.
    resume_s3_key: Optional[str] = None
    resume_filename: Optional[str] = None
    resume_text: Optional[str] = None
    resume_uploaded_at: Optional[str] = None


class JDRow(BaseModel):
    """
    What the admin fills in: a title, a description, a deadline, the two
    thresholds and the interviewer who will decide. Questions are added
    separately because a reference answer does not fit in a URL alongside
    everything else.
    """
    jd_id: str
    org_id: str
    org_name: str                     # denormalised for the public feed
    title: str
    description: str
    # The interviewer is chosen when the JD is created. There is no later
    # assignment or scheduling step anywhere in the system.
    interviewer_id: str
    interviewer_name: str
    screening_threshold: int          # 0-100, the resume match score to clear
    exam_threshold: int               # 0-100, the exam percentage to clear
    expires_at: str
    expires_epoch: int
    created_by: str
    created_at: str
    updated_at: str
    is_live: str = "false"            # string: it is a GSI hash key
    posted_at: Optional[str] = None
    deleted: bool = False


class QuestionRow(BaseModel):
    """A free-text question. There are no options and no answer key: the
    reference answer is what the AI grades against, and the candidate never
    sees it."""
    question_id: str
    jd_id: str
    org_id: str
    question: str
    reference_answer: str
    marks: int                        # maximum marks for this question
    created_by: str
    created_at: str
    order: int = 0


class ApplicationRow(BaseModel):
    app_id: str                       # sha256(jd_id|candidate_id)[:24]
    org_id: str
    jd_id: str
    jd_title: str
    candidate_id: str
    candidate_name: str
    candidate_email: str

    # Resume as it stood when the candidate applied.
    resume_s3_key: str
    resume_text: str
    resume_snapshot_at: str

    status: ApplicationStatus = ApplicationStatus.NEW

    # Thresholds copied from the JD at apply time, so editing the JD later
    # cannot change a verdict that has already been recorded.
    screening_threshold: int = 70
    exam_threshold: int = 60

    # Resume screening
    resume_score: Optional[int] = None
    resume_ai: Optional[dict[str, Any]] = None
    resume_scored_at: Optional[str] = None

    # Exam. exam_id is the candidate's entry point into the separate exam
    # system; it exists from the moment screening passes.
    exam_id: Optional[str] = None
    exam_started_at: Optional[str] = None
    exam_submitted_at: Optional[str] = None
    exam_scored_at: Optional[str] = None
    integrity_score: int = 100
    exam_marks_awarded: Optional[int] = None
    exam_marks_possible: Optional[int] = None
    exam_score: Optional[int] = None          # percentage, 0-100
    combined_score: Optional[int] = None

    # Interview. The interviewer comes from the JD, denormalised here so the
    # interviewer's own list is one query.
    assigned_interviewer: Optional[str] = None
    assigned_interviewer_name: Optional[str] = None
    decision: Optional[str] = None            # ACCEPTED | FINAL_REJECTED
    decision_by: Optional[str] = None
    decision_at: Optional[str] = None
    interview_notes_count: int = 0

    auto_flagged: bool = False
    auto_flag_reasons: list[str] = Field(default_factory=list)

    created_at: str
    updated_at: str


class AnswerRow(BaseModel):
    """One written answer, and the marks the AI gave it."""
    app_id: str                       # PK
    question_id: str                  # SK
    answer_text: str
    submitted_at: str
    max_marks: int
    marks_awarded: Optional[int] = None
    feedback: Optional[str] = None    # interviewer-facing only
    scored_at: Optional[str] = None


class ProctorEventRow(BaseModel):
    """
    The browser detects, the backend records. Nothing here is inferred by the
    backend itself (spec section 38).
    """
    app_id: str                       # PK
    event_ts: str                     # SK, "<iso>#<short uuid>"
    event_type: str
    penalty: int
    exam_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    client_ts: Optional[str] = None
    server_ts: str


class JobRow(BaseModel):
    job_id: str
    batch_id: str
    job_type: str                     # "resume_match" | "answer_score"
    app_id: str
    org_id: str
    status: JobStatus = JobStatus.QUEUED
    attempts: int = 0
    last_error: Optional[str] = None
    created_at: str
    updated_at: str
    expires_at: int                   # TTL, 24h


class AuditRow(BaseModel):
    entity_id: str                    # PK - app, jd, user or org id
    ts_event: str                     # SK - "<iso>#<short uuid>"
    action: str
    actor_id: str
    actor_role: Optional[str] = None
    org_id: Optional[str] = None
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    expires_at: int                   # TTL, 90 days


# ============================================================================
# AI results. Validated before anything is stored: the model's arithmetic is
# never trusted, and a reply that fails validation is retried or failed.
# ============================================================================

class ResumeMatchResult(BaseModel):
    score: int = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    experience_match: bool = False
    summary: str = ""
    confidence: int = Field(ge=0, le=100)
    red_flags: list[str] = Field(default_factory=list)


class AnswerScoreItem(BaseModel):
    """One question's marks inside a batch result."""
    question_id: str
    marks_awarded: int = Field(ge=0)
    max_marks: int = Field(ge=1)
    feedback: str = ""

    @model_validator(mode="after")
    def _within_bounds(self):
        if self.marks_awarded > self.max_marks:
            raise ValueError(
                f"{self.question_id}: {self.marks_awarded} exceeds the "
                f"maximum of {self.max_marks}")
        return self


class ExamScoreResult(BaseModel):
    """
    The whole paper scored in one reply.

    Cross-question checks that need the submitted set (no missing question, no
    unexpected id, the stored maximum is authoritative) live in
    llm.validate_exam_scores, which has that context.
    """
    results: list[AnswerScoreItem] = Field(min_length=1)
    total_marks_awarded: int = Field(ge=0)
    total_marks_possible: int = Field(ge=1)

    @model_validator(mode="after")
    def _totals_add_up(self):
        summed = sum(r.marks_awarded for r in self.results)
        if self.total_marks_awarded != summed:
            raise ValueError(
                f"total_marks_awarded {self.total_marks_awarded} != summed {summed}")
        possible = sum(r.max_marks for r in self.results)
        if self.total_marks_possible != possible:
            raise ValueError(
                f"total_marks_possible {self.total_marks_possible} != {possible}")
        return self


# ============================================================================
# The one response envelope (spec section 11)
# ============================================================================

def ok(data: Any = None, message: str = "") -> dict:
    """Every successful response leaves in this shape."""
    return {"success": True, "data": data if data is not None else {},
            "message": message}
