"""
auth.py
-------
Sign-up, login, and the role guards every other router depends on.

Authentication is deliberately plain (spec section 4):
  - email + password
  - argon2id hashing, never plaintext, never logged
  - an opaque random session token, stored server-side as a sha256 hash with a
    TTL, handed back as `Authorization: Bearer <session_token>`

There is NO JWT, no refresh token, no token rotation, no blacklist, no logout,
no change/forgot/reset password and no /auth/me. A session simply expires.

Identity always comes from the session row, never from a query parameter, so
no caller can act as another user by editing a URL.
"""

from __future__ import annotations

from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import TypeAdapter, ValidationError

import cache
import config
import db
from models import Email, Role, UserRow, ok, utcnow_iso

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)
_hasher = PasswordHasher()
_email_adapter = TypeAdapter(Email)

MIN_PASSWORD_LENGTH = 8


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hash_password(pw: str) -> str:
    """argon2id. Exposed because admin.py also creates users (interviewers)."""
    return _hasher.hash(pw)


def _verify_pw(hash_: str, pw: str) -> bool:
    try:
        _hasher.verify(hash_, pw)
        return True
    except (VerifyMismatchError, VerificationError):
        return False
    except Exception:                                        # noqa: BLE001
        return False


def clean_email(raw: str) -> str:
    """Validate and normalise, or 400. Used by every endpoint taking an email."""
    try:
        return _email_adapter.validate_python(raw)
    except ValidationError:
        raise HTTPException(400, "that is not a valid email address")


def check_password(pw: str) -> str:
    if not pw or len(pw) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            400, f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(pw) > 128:
        raise HTTPException(400, "password must be at most 128 characters")
    return pw


def _client_ip(request: Request) -> str:
    """Behind a Lambda function URL the real client is first in X-Forwarded-For."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------

class Principal:
    """The caller's identity, built only from the stored session row."""

    def __init__(self, user_id: str, role: Role, org_id: Optional[str],
                 scope: str = "platform", exam_id: Optional[str] = None):
        self.user_id = user_id
        self.role = role
        self.org_id = org_id
        self.scope = scope
        self.exam_id = exam_id


def _session_or_401(creds: Optional[HTTPAuthorizationCredentials]) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(401, "sign in first: send Authorization: Bearer <session_token>")
    row = db.get_session(creds.credentials)
    if not row:
        raise HTTPException(401, "session is invalid or has expired, sign in again")
    return row


def require_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Principal:
    """Any signed-in platform user. An exam session is deliberately refused:
    it only unlocks the separate exam system."""
    row = _session_or_401(creds)
    if row.get("scope") != "platform":
        raise HTTPException(403, "this session is only valid for the exam system")
    user = db.get_user(row["user_id"])
    if not user or not user.get("active", True):
        raise HTTPException(401, "this account is no longer active")
    return Principal(user_id=row["user_id"], role=Role(row["role"]),
                     org_id=row.get("org_id"))


def require_admin(p: Principal = Depends(require_user)) -> Principal:
    if p.role != Role.ADMIN:
        raise HTTPException(403, "this endpoint is for admins")
    if not p.org_id:
        raise HTTPException(403, "this admin has no organization")
    return p


def require_candidate(p: Principal = Depends(require_user)) -> Principal:
    if p.role != Role.CANDIDATE:
        raise HTTPException(403, "this endpoint is for candidates")
    return p


def require_interviewer(p: Principal = Depends(require_user)) -> Principal:
    if p.role != Role.INTERVIEWER:
        raise HTTPException(403, "this endpoint is for interviewers")
    if not p.org_id:
        raise HTTPException(403, "this interviewer has no organization")
    return p


def require_exam_session(exam_id: str,
                         creds: HTTPAuthorizationCredentials = Depends(bearer)
                         ) -> Principal:
    """
    The exam system's own guard.

    An exam session is bound to ONE exam. A platform session does not open the
    exam, and an exam session for another exam does not either, so eligibility
    can never be decided by the frontend.
    """
    row = _session_or_401(creds)
    if row.get("scope") != "exam":
        raise HTTPException(403, "sign in through the exam login for this exam")
    if row.get("exam_id") != exam_id:
        raise HTTPException(403, "this session belongs to a different exam")
    return Principal(user_id=row["user_id"], role=Role(row["role"]),
                     org_id=row.get("org_id"), scope="exam",
                     exam_id=row.get("exam_id"))


def issue_session(user: dict, ttl_seconds: Optional[int] = None,
                  scope: str = "platform",
                  exam_id: Optional[str] = None) -> dict:
    """Create a session and shape the login payload every caller returns."""
    ttl = ttl_seconds or config.session_ttl_seconds()
    token = db.create_session(user["user_id"], Role(user["role"]),
                              user.get("org_id"), ttl, scope=scope,
                              exam_id=exam_id)
    payload = {
        "session_token": token,
        "expires_in_seconds": ttl,
        "user_id": user["user_id"],
        "role": user["role"],
        "name": user.get("name"),
        "email": user.get("email"),
    }
    if user.get("org_id"):
        payload["org_id"] = user["org_id"]
    if exam_id:
        payload["exam_id"] = exam_id
    return payload


# ---------------------------------------------------------------------------
# Sign up
# ---------------------------------------------------------------------------

@router.get("/signup/admin")
def signup_admin(
    request: Request,
    organization_name: str = Query(..., min_length=2, max_length=120),
    email: str = Query(...),
    password: str = Query(...),
    name: Optional[str] = Query(None, max_length=100),
):
    """Create an organization and its first admin. This is the only way an
    organization comes into existence; there is no separate org signup."""
    ip = _client_ip(request)
    if not cache.check_rate(f"signup:{ip}", limit=config.signup_rate_per_hour(),
                            window_seconds=3600):
        raise HTTPException(429, "too many signups from this address, try later")

    email = clean_email(email)
    check_password(password)
    if db.get_user_by_email(email):
        raise HTTPException(409, "an account with this email already exists")

    org = db.create_org(name=organization_name, created_by="pending")
    user = UserRow(user_id=db.new_id("usr"), email=email,
                   password_hash=hash_password(password), role=Role.ADMIN,
                   name=name or email.split("@")[0], org_id=org.org_id,
                   created_at=utcnow_iso())
    db.create_user(user)
    db.set_org_creator(org.org_id, user.user_id)
    db.write_audit(entity_id=org.org_id, action="admin.created",
                   actor_id=user.user_id, actor_role=Role.ADMIN.value,
                   org_id=org.org_id,
                   metadata={"organization_name": organization_name})

    payload = issue_session(db.get_user(user.user_id))
    payload["organization_name"] = org.name
    return ok(payload, "Organization and admin account created")


@router.get("/signup/candidate")
def signup_candidate(
    request: Request,
    email: str = Query(...),
    password: str = Query(...),
    name: Optional[str] = Query(None, max_length=100),
):
    """Candidates sign themselves up and belong to no organization: they apply
    to any company's jobs."""
    ip = _client_ip(request)
    if not cache.check_rate(f"signup:{ip}", limit=config.signup_rate_per_hour(),
                            window_seconds=3600):
        raise HTTPException(429, "too many signups from this address, try later")

    email = clean_email(email)
    check_password(password)
    if db.get_user_by_email(email):
        raise HTTPException(409, "an account with this email already exists")

    user = UserRow(user_id=db.new_id("usr"), email=email,
                   password_hash=hash_password(password), role=Role.CANDIDATE,
                   name=name or email.split("@")[0], org_id=None,
                   created_at=utcnow_iso())
    db.create_user(user)
    db.write_audit(entity_id=user.user_id, action="candidate.signup",
                   actor_id=user.user_id, actor_role=Role.CANDIDATE.value)
    return ok(issue_session(db.get_user(user.user_id)), "Candidate account created")


# ---------------------------------------------------------------------------
# Login - one endpoint for all three roles
# ---------------------------------------------------------------------------

@router.get("/login")
def login(email: str = Query(...), password: str = Query(...)):
    """
    The backend decides which system the caller gets from the stored role. An
    unknown email, a wrong password and a deleted account all answer the same
    way, so this cannot be used to discover who has an account.
    """
    email = clean_email(email)
    if not cache.check_rate(f"login:{email}", limit=config.login_rate_per_5min(),
                            window_seconds=300):
        raise HTTPException(429, "too many attempts, try again in 5 minutes")

    user = db.get_user_by_email(email)
    if not user or not user.get("active", True) \
            or not _verify_pw(user["password_hash"], password):
        raise HTTPException(401, "incorrect email or password")

    db.write_audit(entity_id=user["user_id"], action=f"{user['role']}.login",
                   actor_id=user["user_id"], actor_role=user["role"],
                   org_id=user.get("org_id"))
    return ok(issue_session(user), "Signed in")
