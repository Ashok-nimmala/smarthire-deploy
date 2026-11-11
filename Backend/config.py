"""
config.py
---------
Central configuration. Nothing tunable is hard-coded anywhere else.

What lives here vs on the job:
  - per JD (set by the admin):  screening_threshold, exam_threshold
  - here (platform-wide):       the HOLD band width, scoring weights, the
                                proctoring penalties, session lifetime, limits

Spec section 20 requires the borderline HOLD range to be defined in backend
configuration rather than invented by the frontend; section 39 requires the
proctoring penalties to be centralised. Both live here.

Every value is overridable with an environment variable, so it can be retuned
with `aws lambda update-function-configuration` and no redeploy.
"""

from __future__ import annotations

import os


def _int_env(name: str, default: int, lo: int, hi: int) -> int:
    """Read an int from the environment, clamped, falling back on anything odd."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return max(lo, min(hi, int(raw)))
    except ValueError:
        print(f"config: {name}={raw!r} is not an integer, using {default}")
        return default


# --- screening -------------------------------------------------------------
# The admin sets one number per JD: the screening threshold. A resume at or
# above it passes. A resume inside the band immediately below it is borderline
# and goes to HOLD for the admin to judge. Anything lower is rejected outright.
#
#   score >= threshold                    -> SCREENING_PASSED
#   threshold - HOLD_BAND <= score        -> HOLD
#   below that                            -> REJECTED
def screening_hold_band() -> int:
    """How many points below the JD's threshold still count as borderline."""
    return _int_env("SCREENING_HOLD_BAND", 15, 0, 100)


# --- combined score --------------------------------------------------------
# The interviewer sees one number combining both AI stages, scaled by how
# cleanly the exam was taken. Weights are platform-wide; the pass/fail
# thresholds that actually gate the pipeline are per JD.
def weight_resume() -> int:
    return _int_env("WEIGHT_RESUME", 40, 0, 100)


def weight_exam() -> int:
    return _int_env("WEIGHT_EXAM", 60, 0, 100)


# --- auto-flags (advisory only, they never gate anything) ------------------
def confidence_cutoff() -> int:
    """Below this AI confidence the application is flagged for a human look."""
    return _int_env("CONFIDENCE_CUTOFF", 60, 0, 100)


def disagreement_cutoff() -> int:
    """Flag when the resume and exam scores differ by at least this much."""
    return _int_env("DISAGREEMENT_CUTOFF", 30, 1, 100)


def integrity_flag_cutoff() -> int:
    """Flag an exam taken with an integrity score below this."""
    return _int_env("INTEGRITY_FLAG_CUTOFF", 70, 0, 100)


# --- jobs ------------------------------------------------------------------
def default_job_validity_days() -> int:
    """Used when an admin creates a job without naming an expiry."""
    return _int_env("DEFAULT_JOB_VALIDITY_DAYS", 30, 1, 365)


# --- sessions --------------------------------------------------------------
# Plain opaque server-side sessions. No JWT, no refresh tokens, no blacklist:
# a session row simply expires (spec section 4).
def session_ttl_seconds() -> int:
    return _int_env("SESSION_TTL_SECONDS", 12 * 3600, 300, 7 * 24 * 3600)


def exam_session_ttl_seconds() -> int:
    """An exam session is deliberately shorter-lived than a platform session."""
    return _int_env("EXAM_SESSION_TTL_SECONDS", 4 * 3600, 300, 24 * 3600)


# --- rate limits -----------------------------------------------------------
# Every limit the API enforces is defined here rather than inline, so it can be
# retuned without a redeploy. Signups are counted per client IP, and everyone
# behind one office NAT or one CI runner shares that IP - hence a limit that is
# generous enough not to punish a shared egress address.
def signup_rate_per_hour() -> int:
    return _int_env("SIGNUP_RATE_PER_HOUR", 60, 1, 10000)


def login_rate_per_5min() -> int:
    return _int_env("LOGIN_RATE_PER_5MIN", 10, 1, 1000)


def apply_rate_per_hour() -> int:
    return _int_env("APPLY_RATE_PER_HOUR", 30, 1, 1000)


def proctor_events_per_second() -> int:
    return _int_env("PROCTOR_EVENTS_PER_SECOND", 5, 1, 100)


def public_reads_per_minute() -> int:
    return _int_env("PUBLIC_READS_PER_MINUTE", 60, 1, 10000)


def public_searches_per_minute() -> int:
    return _int_env("PUBLIC_SEARCHES_PER_MINUTE", 30, 1, 10000)


# --- resume upload ---------------------------------------------------------
def max_resume_bytes() -> int:
    return _int_env("MAX_RESUME_BYTES", 5 * 1024 * 1024, 1024, 20 * 1024 * 1024)


# --- proctoring ------------------------------------------------------------
# Every event type the platform recognises, with the integrity penalty it
# costs. The browser reports the event; the backend owns this list and the
# arithmetic (spec sections 37-39). An unknown event_type is rejected.
DEFAULT_PENALTIES: dict[str, int] = {
    "tab_switch": 5,
    "fullscreen_exit": 15,
    "copy": 8,
    "paste": 10,
    "right_click": 2,
    "devtools_open": 25,
    "multiple_faces": 20,
    "no_face": 10,
    "network_drop": 0,
}


def proctor_penalties() -> dict[str, int]:
    """
    Penalty per event type. Override wholesale with PROCTOR_PENALTIES as JSON,
    e.g. {"paste": 15, "tab_switch": 8}. Unknown keys are ignored so a typo
    cannot silently disable a penalty.
    """
    penalties = DEFAULT_PENALTIES.copy()
    raw = os.environ.get("PROCTOR_PENALTIES")
    if not raw:
        return penalties
    try:
        import json
        for k, v in json.loads(raw).items():
            if k in penalties:
                penalties[k] = max(0, min(100, int(v)))
            else:
                print(f"config: ignoring unknown proctoring event {k!r}")
    except (ValueError, TypeError, AttributeError) as e:
        print(f"config: PROCTOR_PENALTIES is not valid JSON ({e}), using defaults")
    return penalties


def describe() -> dict:
    """Read-only view, used by the admin dashboard and the docs."""
    return {
        "screening": {"hold_band": screening_hold_band()},
        "combined_score_weights": {"resume": weight_resume(), "exam": weight_exam()},
        "auto_flags": {"confidence_cutoff": confidence_cutoff(),
                       "disagreement_cutoff": disagreement_cutoff(),
                       "integrity_flag_cutoff": integrity_flag_cutoff()},
        "jobs": {"default_validity_days": default_job_validity_days()},
        "rate_limits": {"signup_per_hour": signup_rate_per_hour(),
                        "login_per_5min": login_rate_per_5min(),
                        "apply_per_hour": apply_rate_per_hour(),
                        "proctor_events_per_second": proctor_events_per_second()},
        "proctoring_penalties": proctor_penalties(),
    }
