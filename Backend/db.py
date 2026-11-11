"""
db.py
-----
The only module that talks to DynamoDB and S3. Routers never build a query.

Rules enforced here rather than trusted to callers:
- A float is refused outright; nothing stores a fraction.
- `status` can only change through transition_status, which walks the state
  machine and writes conditionally, so two racing callers cannot both win.
- Every tenant-scoped read takes the org_id and returns None when it does not
  match, so a route can answer 404 instead of leaking that a row exists.
"""

from __future__ import annotations

import hashlib
import os
import time
import uuid
from decimal import Decimal
from typing import Any, Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError
from pydantic import BaseModel

from models import (
    STATE_MACHINE,
    ApplicationStatus,
    AnswerRow,
    ApplicationRow,
    AuditRow,
    JDRow,
    JobRow,
    OrgRow,
    ProctorEventRow,
    QuestionRow,
    Role,
    SessionRow,
    UserRow,
    utcnow_iso,
)

REGION = os.environ.get("AWS_REGION", "ap-south-1")
_ddb = boto3.resource("dynamodb", region_name=REGION)
_s3 = boto3.client("s3", region_name=REGION)

BUCKET = os.environ.get("BUCKET_NAME", "")

TABLES = {
    "orgs":         os.environ.get("TABLE_ORGS", "bnp-backend-orgs"),
    "users":        os.environ.get("TABLE_USERS", "bnp-backend-users"),
    "sessions":     os.environ.get("TABLE_SESSIONS", "bnp-backend-sessions"),
    "jds":          os.environ.get("TABLE_JDS", "bnp-backend-jds"),
    "questions":    os.environ.get("TABLE_QUESTIONS", "bnp-backend-questions"),
    "applications": os.environ.get("TABLE_APPLICATIONS", "bnp-backend-applications"),
    "answers":      os.environ.get("TABLE_ANSWERS", "bnp-backend-answers"),
    "proctor":      os.environ.get("TABLE_ANTICHEAT", "bnp-backend-anticheat"),
    "jobs":         os.environ.get("TABLE_JOBS", "bnp-backend-jobs"),
    "audit":        os.environ.get("TABLE_AUDIT", "bnp-backend-audit"),
    "cache":        os.environ.get("TABLE_CACHE", "bnp-backend-cache"),
}

_handles: dict[str, Any] = {}


def T(name: str):
    """Table handle by short name, memoised for the life of a warm Lambda."""
    if name not in _handles:
        _handles[name] = _ddb.Table(TABLES[name])
    return _handles[name]


class FloatRefused(TypeError):
    """Raised instead of silently rounding. Fix the caller, not the value."""


def _to_ddb(value):
    """Recursively prepare a value for DynamoDB. Floats are a bug, not a case
    to handle: a rounded score is a wrong score."""
    if isinstance(value, float):
        raise FloatRefused(f"float {value!r} cannot be stored; convert to int first")
    if isinstance(value, dict):
        return {k: _to_ddb(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_ddb(v) for v in value]
    return value


def _from_ddb(value):
    """Decimal is how DynamoDB hands numbers back; everything we store is an int."""
    if isinstance(value, Decimal):
        return int(value)
    if isinstance(value, dict):
        return {k: _from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_ddb(v) for v in value]
    return value


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def ttl_from_now(seconds: int) -> int:
    return int(time.time()) + seconds


def _put(table: str, row: BaseModel) -> dict:
    item = _to_ddb(row.model_dump(mode="json", exclude_none=True))
    T(table).put_item(Item=item)
    return item


def _query_all(table: str, **kwargs) -> list[dict]:
    """
    Page a query to the end.

    A single query returns at most 1 MB. Application rows carry the resume
    text, so one page holds only a few dozen of them - a dashboard that read
    one page would silently under-report.
    """
    items, start = [], None
    while True:
        if start:
            kwargs["ExclusiveStartKey"] = start
        resp = T(table).query(**kwargs)
        items.extend(resp.get("Items", []))
        start = resp.get("LastEvaluatedKey")
        if not start:
            break
    return _from_ddb(items)


# ============================================================================
# Organisations
# ============================================================================

def create_org(name: str, created_by: str) -> OrgRow:
    org = OrgRow(org_id=new_id("org"), name=name, created_by=created_by,
                 created_at=utcnow_iso())
    _put("orgs", org)
    return org


def get_org(org_id: str) -> Optional[dict]:
    if not org_id:
        return None
    return _from_ddb(T("orgs").get_item(Key={"org_id": org_id}).get("Item"))


def set_org_creator(org_id: str, user_id: str) -> None:
    T("orgs").update_item(Key={"org_id": org_id},
                          UpdateExpression="SET created_by = :u",
                          ExpressionAttributeValues={":u": user_id})


# ============================================================================
# Users
# ============================================================================

def create_user(user: UserRow) -> dict:
    """Conditional on the id being free; email uniqueness is checked by the
    caller through get_user_by_email."""
    item = _to_ddb(user.model_dump(mode="json", exclude_none=True))
    T("users").put_item(Item=item,
                        ConditionExpression="attribute_not_exists(user_id)")
    return item


def get_user(user_id: str) -> Optional[dict]:
    if not user_id:
        return None
    return _from_ddb(T("users").get_item(Key={"user_id": user_id}).get("Item"))


def get_user_by_email(email: str) -> Optional[dict]:
    rows = _query_all("users", IndexName="email-index",
                      KeyConditionExpression=Key("email").eq(email.lower()))
    return rows[0] if rows else None


def update_user(user_id: str, updates: dict) -> Optional[dict]:
    if not updates:
        return get_user(user_id)
    names = {f"#f{i}": k for i, k in enumerate(updates)}
    values = {f":v{i}": _to_ddb(v) for i, v in enumerate(updates.values())}
    expr = "SET " + ", ".join(f"{n} = :v{i}" for i, n in enumerate(names))
    resp = T("users").update_item(
        Key={"user_id": user_id}, UpdateExpression=expr,
        ExpressionAttributeNames=names, ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW")
    return _from_ddb(resp.get("Attributes"))


def list_org_interviewers(org_id: str) -> list[dict]:
    return _query_all("users", IndexName="org-role-index",
                      KeyConditionExpression=Key("org_id").eq(org_id)
                      & Key("role").eq(Role.INTERVIEWER.value))


def delete_user(user_id: str, org_id: str) -> bool:
    """Hard delete, scoped to the org. Their audit rows and any application
    they already decided keep their name, so history survives."""
    try:
        T("users").delete_item(
            Key={"user_id": user_id},
            ConditionExpression=Attr("org_id").eq(org_id))
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


# ============================================================================
# Sessions - plain opaque server-side sessions, no JWT anywhere
# ============================================================================

def _session_id(token: str) -> str:
    """Only the hash is stored, so a dump of the table cannot be replayed."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user_id: str, role: Role, org_id: Optional[str],
                   ttl_seconds: int, scope: str = "platform",
                   exam_id: Optional[str] = None) -> str:
    """Returns the token to hand to the client. It is never stored."""
    token = uuid.uuid4().hex + uuid.uuid4().hex
    row = SessionRow(session_id=_session_id(token), user_id=user_id, role=role,
                     org_id=org_id, scope=scope, exam_id=exam_id,
                     created_at=utcnow_iso(),
                     expires_at=ttl_from_now(ttl_seconds))
    _put("sessions", row)
    return token


def get_session(token: str) -> Optional[dict]:
    """None when unknown or expired. DynamoDB's TTL sweep is not immediate, so
    the expiry is also checked here."""
    if not token:
        return None
    row = _from_ddb(T("sessions").get_item(
        Key={"session_id": _session_id(token)}).get("Item"))
    if not row:
        return None
    if int(row.get("expires_at", 0)) <= int(time.time()):
        return None
    return row


# ============================================================================
# Job descriptions
# ============================================================================

def create_jd(jd: JDRow | dict) -> dict:
    item = _to_ddb(jd.model_dump(mode="json", exclude_none=True)
                   if isinstance(jd, JDRow) else jd)
    T("jds").put_item(Item=item)
    return item


def get_jd(jd_id: str) -> Optional[dict]:
    if not jd_id:
        return None
    return _from_ddb(T("jds").get_item(Key={"jd_id": jd_id}).get("Item"))


def get_jd_scoped(jd_id: str, org_id: str) -> Optional[dict]:
    """None for another tenant's JD, so the route answers 404 rather than 403."""
    jd = get_jd(jd_id)
    return jd if jd and jd.get("org_id") == org_id else None


def update_jd(jd_id: str, org_id: str, updates: dict) -> Optional[dict]:
    if not updates:
        return get_jd_scoped(jd_id, org_id)
    names = {f"#f{i}": k for i, k in enumerate(updates)}
    values = {f":v{i}": _to_ddb(v) for i, v in enumerate(updates.values())}
    values[":org"] = org_id
    expr = "SET " + ", ".join(f"{n} = :v{i}" for i, n in enumerate(names))
    try:
        resp = T("jds").update_item(
            Key={"jd_id": jd_id}, UpdateExpression=expr,
            ConditionExpression="org_id = :org",
            ExpressionAttributeNames=names, ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return _from_ddb(resp.get("Attributes"))


def list_org_jds(org_id: str, include_deleted: bool = False) -> list[dict]:
    rows = _query_all("jds", IndexName="org-index",
                      KeyConditionExpression=Key("org_id").eq(org_id))
    return rows if include_deleted else [j for j in rows if not j.get("deleted")]


def list_public_live_jds(limit: int = 50,
                         cursor: Optional[dict] = None) -> tuple[list[dict], Optional[dict]]:
    """
    The public feed: live, not deleted, not expired. Newest first.

    Expiry is filtered here AND re-checked on every by-id path, because a
    direct link must not outlive the deadline either.
    """
    kwargs: dict[str, Any] = {
        "IndexName": "public-live-index",
        "KeyConditionExpression": Key("is_live").eq("true"),
        "ScanIndexForward": False,
        "Limit": max(limit * 2, 20),
    }
    if cursor:
        kwargs["ExclusiveStartKey"] = cursor
    resp = T("jds").query(**kwargs)
    now = int(time.time())
    items = [j for j in _from_ddb(resp.get("Items", []))
             if not j.get("deleted") and int(j.get("expires_epoch") or 0) > now]
    return items[:limit], resp.get("LastEvaluatedKey")


# ============================================================================
# Questions
# ============================================================================

def create_question(q: QuestionRow) -> dict:
    return _put("questions", q)


def get_question(question_id: str) -> Optional[dict]:
    if not question_id:
        return None
    return _from_ddb(T("questions").get_item(
        Key={"question_id": question_id}).get("Item"))


def list_questions_for_jd(jd_id: str) -> list[dict]:
    rows = _query_all("questions", IndexName="jd-index",
                      KeyConditionExpression=Key("jd_id").eq(jd_id))
    rows.sort(key=lambda q: (int(q.get("order") or 0), q["question_id"]))
    return rows


def update_question(question_id: str, org_id: str, updates: dict) -> Optional[dict]:
    if not updates:
        return get_question(question_id)
    names = {f"#f{i}": k for i, k in enumerate(updates)}
    values = {f":v{i}": _to_ddb(v) for i, v in enumerate(updates.values())}
    values[":org"] = org_id
    expr = "SET " + ", ".join(f"{n} = :v{i}" for i, n in enumerate(names))
    try:
        resp = T("questions").update_item(
            Key={"question_id": question_id}, UpdateExpression=expr,
            ConditionExpression="org_id = :org",
            ExpressionAttributeNames=names, ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return _from_ddb(resp.get("Attributes"))


def delete_question(question_id: str, org_id: str) -> bool:
    try:
        T("questions").delete_item(
            Key={"question_id": question_id},
            ConditionExpression=Attr("org_id").eq(org_id))
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


# ============================================================================
# Applications
# ============================================================================

def deterministic_app_id(jd_id: str, candidate_id: str) -> str:
    """One application per candidate per job, forever. A retried apply cannot
    create a second row because the id is derived from the pair."""
    return "app_" + hashlib.sha256(f"{jd_id}|{candidate_id}".encode()).hexdigest()[:24]


def create_application_once(app: ApplicationRow) -> bool:
    """True when this call created it, False when it already existed."""
    item = _to_ddb(app.model_dump(mode="json", exclude_none=True))
    try:
        T("applications").put_item(
            Item=item, ConditionExpression="attribute_not_exists(app_id)")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def get_application(app_id: str) -> Optional[dict]:
    if not app_id:
        return None
    return _from_ddb(T("applications").get_item(
        Key={"app_id": app_id}).get("Item"))


def patch_application(app_id: str, org_id: str, updates: dict) -> Optional[dict]:
    """Everything except status. A status change must walk the state machine."""
    if "status" in updates:
        raise ValueError("use transition_status to change status")
    if not updates:
        return get_application(app_id)
    updates = {**updates, "updated_at": utcnow_iso()}
    names = {f"#f{i}": k for i, k in enumerate(updates)}
    values = {f":v{i}": _to_ddb(v) for i, v in enumerate(updates.values())}
    values[":org"] = org_id
    expr = "SET " + ", ".join(f"{n} = :v{i}" for i, n in enumerate(names))
    try:
        resp = T("applications").update_item(
            Key={"app_id": app_id}, UpdateExpression=expr,
            ConditionExpression="org_id = :org",
            ExpressionAttributeNames=names, ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return _from_ddb(resp.get("Attributes"))


def transition_status(app_id: str, to_status: ApplicationStatus,
                      extra_updates: Optional[dict] = None) -> Optional[dict]:
    """
    The ONLY way a status changes.

    Raises ValueError when the edge is not in the state machine. Returns None
    when the row moved underneath us - the write is conditional on the status
    we read, so exactly one of two racing callers wins.
    """
    current = get_application(app_id)
    if not current:
        return None
    cur_status = current["status"]
    if to_status.value not in STATE_MACHINE.get(cur_status, set()):
        raise ValueError(f"invalid transition {cur_status} -> {to_status.value}")

    updates = {"status": to_status.value, "updated_at": utcnow_iso(),
               **(extra_updates or {})}
    names = {f"#f{i}": k for i, k in enumerate(updates)}
    values = {f":v{i}": _to_ddb(v) for i, v in enumerate(updates.values())}
    values[":cur"] = cur_status
    expr = "SET " + ", ".join(f"{n} = :v{i}" for i, n in enumerate(names))
    try:
        resp = T("applications").update_item(
            Key={"app_id": app_id}, UpdateExpression=expr,
            ConditionExpression="#st = :cur",
            ExpressionAttributeNames={**names, "#st": "status"},
            ExpressionAttributeValues=values, ReturnValues="ALL_NEW")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return _from_ddb(resp.get("Attributes"))


def query_apps_by_jd(jd_id: str, status: Optional[str] = None) -> list[dict]:
    cond = Key("jd_id").eq(jd_id)
    if status:
        cond = cond & Key("status").eq(status)
    return _query_all("applications", IndexName="jd-status-index",
                      KeyConditionExpression=cond)


def query_apps_by_candidate(candidate_id: str) -> list[dict]:
    return _query_all("applications", IndexName="candidate-index",
                      KeyConditionExpression=Key("candidate_id").eq(candidate_id))


def query_apps_by_interviewer(interviewer_id: str) -> list[dict]:
    return _query_all("applications", IndexName="interviewer-index",
                      KeyConditionExpression=Key("assigned_interviewer").eq(interviewer_id))


def bump_notes_count(app_id: str) -> None:
    # DynamoDB's grammar wants SET before ADD.
    T("applications").update_item(
        Key={"app_id": app_id},
        UpdateExpression="SET updated_at = :now ADD interview_notes_count :one",
        ExpressionAttributeValues={":now": utcnow_iso(), ":one": 1})


# ============================================================================
# Answers
# ============================================================================

def upsert_answer(answer: AnswerRow) -> dict:
    return _put("answers", answer)


def list_answers(app_id: str) -> list[dict]:
    return _query_all("answers", KeyConditionExpression=Key("app_id").eq(app_id))


def write_scored_answers(app_id: str, scores: list[dict]) -> None:
    """One batch write for the whole paper."""
    now = utcnow_iso()
    with T("answers").batch_writer() as batch:
        for s in scores:
            batch.put_item(Item=_to_ddb({**s, "app_id": app_id, "scored_at": now}))


# ============================================================================
# Proctoring
# ============================================================================

def put_proctor_event(event: ProctorEventRow) -> dict:
    return _put("proctor", event)


def list_proctor_events(app_id: str) -> list[dict]:
    return _query_all("proctor", KeyConditionExpression=Key("app_id").eq(app_id))


def degrade_integrity(app_id: str, penalty: int) -> Optional[int]:
    """
    Apply a penalty atomically and return the new score.

    Conditional on the attempt still being in progress, so an event arriving
    after submission cannot change a score that has already been used. Floors
    at 0. Returns None when the attempt is not live.
    """
    # Two steps, because DynamoDB cannot clamp inside an expression: subtract
    # atomically, then floor the (rare) negative result.
    try:
        resp = T("applications").update_item(
            Key={"app_id": app_id},
            UpdateExpression="SET integrity_score = integrity_score - :p, "
                             "updated_at = :now",
            ConditionExpression=Attr("status").eq(
                ApplicationStatus.EXAM_IN_PROGRESS.value),
            ExpressionAttributeValues={":p": int(penalty), ":now": utcnow_iso()},
            ReturnValues="ALL_NEW")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    score = int(_from_ddb(resp["Attributes"]).get("integrity_score", 0))
    if score < 0:
        T("applications").update_item(
            Key={"app_id": app_id},
            UpdateExpression="SET integrity_score = :zero",
            ExpressionAttributeValues={":zero": 0})
        score = 0
    return score


# ============================================================================
# Background jobs
# ============================================================================

def create_job(job: JobRow) -> dict:
    return _put("jobs", job)


def get_job(job_id: str) -> Optional[dict]:
    return _from_ddb(T("jobs").get_item(Key={"job_id": job_id}).get("Item"))


def update_job_status(job_id: str, status: str,
                      error: Optional[str] = None) -> None:
    values = {":s": status, ":now": utcnow_iso(), ":one": 1}
    expr = "SET #st = :s, updated_at = :now"
    if error:
        expr += ", last_error = :e"
        values[":e"] = str(error)[:500]
    expr += " ADD attempts :one"
    T("jobs").update_item(
        Key={"job_id": job_id}, UpdateExpression=expr,
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues=values)


def list_batch_jobs(batch_id: str) -> list[dict]:
    return _query_all("jobs", IndexName="batch-index",
                      KeyConditionExpression=Key("batch_id").eq(batch_id))


def list_jobs_by_org_status(org_id: str, status: str,
                            limit: int = 50) -> list[dict]:
    rows = _query_all("jobs", IndexName="org-status-index",
                      KeyConditionExpression=Key("org_id").eq(org_id)
                      & Key("status").eq(status))
    rows.sort(key=lambda j: j.get("updated_at") or "", reverse=True)
    return rows[:limit]


# ============================================================================
# Audit
# ============================================================================

def write_audit(entity_id: str, action: str, actor_id: str,
                actor_role: Optional[str] = None, org_id: Optional[str] = None,
                from_state: Optional[str] = None, to_state: Optional[str] = None,
                metadata: Optional[dict] = None) -> None:
    """Never raises into a caller: a missing audit row must not fail the action
    that produced it. Passwords are never passed in, and never logged."""
    try:
        _put("audit", AuditRow(
            entity_id=entity_id,
            ts_event=f"{utcnow_iso()}#{uuid.uuid4().hex[:8]}",
            action=action, actor_id=actor_id, actor_role=actor_role,
            org_id=org_id, from_state=from_state, to_state=to_state,
            metadata=metadata or {},
            expires_at=ttl_from_now(90 * 24 * 3600)))
    except Exception as e:                                   # noqa: BLE001
        print(f"audit write failed for {entity_id}/{action}: {e}")


def list_audit(entity_id: str, limit: int = 100) -> list[dict]:
    resp = T("audit").query(
        KeyConditionExpression=Key("entity_id").eq(entity_id),
        ScanIndexForward=False, Limit=limit)
    return _from_ddb(resp.get("Items", []))


def list_org_audit(entity_ids: list[str], limit: int = 20) -> list[dict]:
    """Recent activity across a handful of entities, newest first."""
    events: list[dict] = []
    for eid in entity_ids[:25]:
        events.extend(list_audit(eid, limit=10))
    events.sort(key=lambda e: e.get("ts_event") or "", reverse=True)
    return events[:limit]


# ============================================================================
# S3 - resumes
#
# The PDF lives in S3; the database keeps only the reference and the extracted
# text. The bucket is private, so the interviewer gets a short-lived presigned
# URL rather than a public link (spec section 57).
# ============================================================================

def resume_key(candidate_id: str, resume_id: str) -> str:
    return f"candidates/{candidate_id}/resumes/{resume_id}.pdf"


def put_resume(key: str, body: bytes) -> None:
    if not BUCKET:
        raise RuntimeError("BUCKET_NAME is not configured")
    _s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                   ContentType="application/pdf",
                   ServerSideEncryption="AES256")


def presign_resume(key: str, seconds: int = 900) -> Optional[str]:
    if not BUCKET or not key:
        return None
    try:
        return _s3.generate_presigned_url(
            "get_object", Params={"Bucket": BUCKET, "Key": key},
            ExpiresIn=seconds)
    except ClientError as e:                                 # noqa: BLE001
        print(f"presign failed for {key}: {e}")
        return None
