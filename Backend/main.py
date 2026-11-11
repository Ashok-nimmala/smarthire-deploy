"""
main.py
-------
The entry point. It only wires things together.

1. Builds the FastAPI app and registers one router per area.
2. Logs one line per request - path only, never the query string, because
   under the GET-first convention the query string can carry a password.
3. Turns every response, success or failure, into the one agreed envelope.
4. Dispatches an SQS invocation to sqs_worker; everything else goes to Mangum.

Never remove the `handler` symbol at the bottom: AWS Lambda calls main.handler.
"""

from __future__ import annotations

import os
import time
import traceback
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
# Starlette raises its OWN HTTPException for an unknown path (404) and a wrong
# method (405). FastAPI's HTTPException subclasses it, so handling the Starlette
# one handles both - handling only FastAPI's lets routing errors escape the
# envelope as a bare {"detail": ...}.
from starlette.exceptions import HTTPException

from admin import router as admin_router
from auth import router as auth_router
from candidate import candidate_router, public_router
from exam import router as exam_router
from interviewer import router as interviewer_router
from models import ok
from sqs_worker import handle_sqs_event

app = FastAPI(
    title="SmartHire",
    version="2.0.0",
    description=(
        "Hiring platform: automatic resume screening, a written exam with "
        "proctoring, and one interviewer decision. Every endpoint is GET "
        "except the resume upload and the long-paper exam submit."),
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")
                   if o.strip()] or ["*"]
_WILDCARD = ALLOWED_ORIGINS == ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # A wildcard origin with credentials is rejected by every browser, so only
    # allow credentials once a real origin list is configured.
    allow_credentials=not _WILDCARD,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request logging
#
# The query string is NEVER logged. Sign-up, login and interviewer creation all
# carry a password there under this project's GET-first convention, and a
# password must not reach CloudWatch.
# ---------------------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.time()
    request_id = uuid.uuid4().hex[:12]
    method, path = request.method, request.url.path
    try:
        response = await call_next(request)
    except Exception:
        ms = int((time.time() - started) * 1000)
        print(f"[{request_id}] {method} {path} -> crashed after {ms}ms")
        print(traceback.format_exc(limit=-6))
        raise
    ms = int((time.time() - started) * 1000)
    print(f"[{request_id}] {method} {path} -> {response.status_code} {ms}ms")
    response.headers["x-request-id"] = request_id
    return response


# ---------------------------------------------------------------------------
# One response shape everywhere
# ---------------------------------------------------------------------------

ERROR_CODES = {
    400: "INVALID_REQUEST",
    401: "NOT_AUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def _error(status: int, message: str, **extra) -> JSONResponse:
    body = {"success": False,
            "error": {"code": ERROR_CODES.get(status, "ERROR"),
                      "message": message}}
    body["error"].update(extra)
    return JSONResponse(status_code=status, content=body)


# Starlette's own wording for a routing miss ("Not Found", "Method Not Allowed")
# tells an integrator nothing, so say what this API actually expects.
ROUTING_MESSAGES = {
    404: "no such endpoint - check the path against API.md",
    405: "wrong HTTP method for this path - every endpoint here is GET, "
         "except POST /candidate/me/resume and POST /exam/{exam_id}/submit",
}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    message = ROUTING_MESSAGES.get(exc.status_code, str(exc.detail)) \
        if str(exc.detail) in ("Not Found", "Method Not Allowed") \
        else str(exc.detail)
    return _error(exc.status_code, message)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request,
                                       exc: RequestValidationError):
    """Name the parameter that was wrong, without echoing its value: a bad
    value may be a password."""
    fields = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", []) if x != "query"]
        fields.append({"parameter": ".".join(loc) or "body",
                       "problem": err.get("msg", "invalid")})
    return _error(422, "one or more parameters are missing or invalid",
                  parameters=fields)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """A state-machine refusal surfaces as a conflict, not a crash."""
    print(f"ValueError on {request.url.path}: {exc}")
    return _error(409, str(exc))


@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    """Never leak a stack trace or an internal detail to the client."""
    print("UNHANDLED", traceback.format_exc(limit=-6))
    return _error(500, "something went wrong on our side")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/", tags=["health"])
def root():
    return ok({"service": "smarthire", "version": "2.0.0", "docs": "/docs"},
              "SmartHire API")


@app.get("/health", tags=["health"])
def health():
    return ok({"status": "healthy", "ts": int(time.time())}, "OK")


# ---------------------------------------------------------------------------
# Routers. One file is one area; this is the only place they are wired.
# ---------------------------------------------------------------------------

app.include_router(auth_router)
app.include_router(public_router)
app.include_router(admin_router)
app.include_router(candidate_router)
app.include_router(interviewer_router)
app.include_router(exam_router)


# ---------------------------------------------------------------------------
# Lambda entry point.
#
# An SQS invocation carries Records with eventSource aws:sqs and must not go
# through the ASGI adapter. Everything else is HTTP.
# ---------------------------------------------------------------------------

_mangum = Mangum(app, lifespan="off")


def handler(event, context):
    """AWS Lambda entry point. Do NOT rename."""
    records = event.get("Records") if isinstance(event, dict) else None
    if records and records[0].get("eventSource") == "aws:sqs":
        return handle_sqs_event(event)
    return _mangum(event, context)
