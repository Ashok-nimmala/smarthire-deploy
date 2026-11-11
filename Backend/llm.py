"""
llm.py
------
The two AI tasks, kept completely separate (spec section 58):

    resume screening   JD + resume            -> a match score
    answer scoring     question + reference
                       answer + candidate
                       answer + max marks     -> marks

Both run only from background jobs, never inside a request.

Nothing in this file is ever exposed through an API: prompts, model names and
gateway details stay server-side. Routes see validated numbers, or an error.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from pydantic import ValidationError

import cache
from models import ExamScoreResult, ResumeMatchResult

AI_TOOL_URL = os.environ.get("AI_TOOL_URL", "")
AI_TOOL_TOKEN = os.environ.get("AI_TOOL_TOKEN", "")

# A Lambda invocation gets 30s. Leave room to write the result and return the
# batch response, and never start a call that cannot finish inside the budget.
INVOCATION_BUDGET_SECONDS = 26

# max_wait_seconds is the gateway's OWN deadline for rotating its keys and
# models. Measured against the live gateway: at 6s it answers 503 every time
# without really trying, at 10s the same prompt succeeds in ~1.4s. So asking
# for less than this is not a short wait, it is a guaranteed failure - and it
# used to cost a whole SQS redelivery (a full visibility timeout) for nothing.
GATEWAY_MIN_WAIT = 10

# Deliberately less than the whole budget, so a busy gateway leaves room for a
# second attempt in THIS invocation. Successful calls measure 1.2-6.5s, so the
# lower cap costs nothing; what it buys is a retry seconds later instead of a
# redelivery a minute later.
CALL_WAIT_SECONDS = 14

# Two real attempts fit in the budget (14 + 10). The cap is here so a gateway
# that fails instantly cannot spin.
MAX_ATTEMPTS = 3


class LLMError(RuntimeError):
    """The gateway failed, or returned something that did not validate."""


class GatewayBusy(LLMError):
    """
    Transport-level failure: busy, out of quota, timed out, unreachable.

    Worth trying again unchanged. Kept apart from a reply that arrived but did
    not validate, because those two need opposite treatment: this one needs
    another try, that one needs a corrected instruction.
    """


def _call_gateway(system: str, user: str, max_output_tokens: int,
                  wait_seconds: int) -> dict:
    """One HTTP call to the AI gateway. Returns the parsed JSON payload."""
    if not AI_TOOL_URL or not AI_TOOL_TOKEN:
        raise LLMError("AI gateway not configured")

    body = json.dumps({
        "system": system,
        "text": user,
        "json": True,
        "max_output_tokens": max_output_tokens,
        "temperature": 0.2,
        "max_wait_seconds": wait_seconds,
    }).encode()

    req = urllib.request.Request(
        AI_TOOL_URL, data=body, method="POST",
        headers={"Authorization": f"Bearer {AI_TOOL_TOKEN}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=wait_seconds + 3) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise GatewayBusy(f"gateway http {e.code}") from e
    except urllib.error.URLError as e:
        raise GatewayBusy(f"gateway network {e.reason}") from e
    except (TimeoutError, OSError) as e:
        raise GatewayBusy(f"gateway timeout {e}") from e
    except json.JSONDecodeError as e:
        raise LLMError("gateway returned a non-JSON envelope") from e

    if not payload.get("ok"):
        err = payload.get("error") or {}
        code = err.get("code", "unknown")
        # A truncated answer arrives as ok:false/ai_bad_json, not as a partial,
        # so that one is the model's fault and gets a corrected instruction.
        # Everything else here means the gateway could not serve the call.
        if code == "ai_bad_json":
            raise LLMError("gateway rejected: ai_bad_json (truncated or not JSON)")
        raise GatewayBusy(f"gateway rejected: {code}")

    data = payload.get("data")
    if data is None:
        try:
            data = json.loads(payload.get("text", ""))
        except json.JSONDecodeError as e:
            raise LLMError("gateway returned a non-JSON body") from e
    if not isinstance(data, dict):
        raise LLMError(f"gateway returned {type(data).__name__}, expected an object")
    return data


def _call_validated(system: str, user: str, max_output_tokens: int,
                    validate, label: str) -> Any:
    """
    Call the gateway until it answers something valid, or the budget runs out.

    Two failures need opposite handling:

      busy / unreachable   try the SAME prompt again, the gateway just could
                           not serve it
      reply did not fit    try again with a corrected instruction appended

    Either way the budget is checked before every call, and a call is never
    started with less than the gateway needs - raising instead lets SQS
    redeliver into a fresh invocation with a full 30s.
    """
    deadline = time.monotonic() + INVOCATION_BUDGET_SECONDS

    def remaining() -> float:
        return deadline - time.monotonic()

    prompt, last_error = system, None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        wait = int(min(CALL_WAIT_SECONDS, remaining()))
        if wait < GATEWAY_MIN_WAIT:
            raise LLMError(
                f"no budget for {label} attempt {attempt} ({remaining():.1f}s "
                f"left, the gateway needs {GATEWAY_MIN_WAIT}s); "
                f"last error: {last_error}")
        try:
            return validate(_call_gateway(prompt, user, max_output_tokens, wait))
        except GatewayBusy as e:
            last_error = e
            prompt = system                       # nothing to correct
            print(f"{label} attempt {attempt} failed (gateway busy): {e}")
        except (LLMError, ValidationError, ValueError, TypeError) as e:
            last_error = e
            prompt = (system + "\n\nCRITICAL: your previous reply was rejected "
                      f"for this reason: {str(e)[:300]}. Return ONLY valid JSON "
                      "in the exact shape described above. No prose, no "
                      "markdown fences.")
            print(f"{label} attempt {attempt} failed: {type(e).__name__}: {str(e)[:250]}")

    raise LLMError(f"{label} failed {MAX_ATTEMPTS} times; last error: {last_error}")


# ===========================================================================
# 1. Resume screening
# ===========================================================================

RESUME_SYSTEM = """You are a professional resume screening evaluator.

You will be given a JOB DESCRIPTION and a CANDIDATE RESUME.

Read the job description carefully and work out for yourself what the role
requires: the skills, the years and kind of experience, the education, the
location and anything else the description asks for. Then judge how well the
resume meets those requirements.

Return ONLY a JSON object with exactly these keys:
{
  "score": <integer 0-100, how well this resume matches this job>,
  "matched_skills": [<requirements from the description the resume evidences>],
  "missing_skills": [<requirements the resume does not evidence>],
  "experience_match": <true or false>,
  "summary": "<two or three sentences justifying the score>",
  "confidence": <integer 0-100, how confident you are in this assessment>,
  "red_flags": [<short strings, or an empty list>]
}

Rules:
- score and confidence are integers, never decimals.
- Judge only against what the job description actually asks for.
- Do not invent experience that is not in the resume.
- Do not output markdown.
- Do not output prose outside the JSON object."""

# gemini-3.8-flash spends output tokens on internal reasoning before it emits,
# and that reasoning counts against this cap. Measured against the live
# gateway, small caps truncate intermittently and the gateway reports a
# truncation as an error rather than a partial - so the cap is deliberately
# generous. The reply is validated either way.
RESUME_MAX_TOKENS = 2400


def score_resume(jd: dict, resume_text: str) -> dict:
    """Cached on the (job description, resume) pair, so a redelivered job is a
    cache hit rather than a second call."""
    user = (f"JOB TITLE:\n{jd.get('title', '')}\n\n"
            f"JOB DESCRIPTION:\n{jd.get('description', '')}\n\n"
            f"CANDIDATE RESUME:\n{resume_text[:18000]}")

    def compute() -> dict:
        return _call_validated(
            RESUME_SYSTEM, user, RESUME_MAX_TOKENS,
            lambda raw: ResumeMatchResult(**raw).model_dump(mode="json"),
            "resume screening")

    return cache.get_or_compute(
        "resume_match",
        {"jd": jd.get("description", "")[:4000], "resume": resume_text[:4000]},
        compute, ttl_seconds=86400)


# ===========================================================================
# 2. Written answer scoring
# ===========================================================================

ANSWER_SYSTEM = """You are a strict but fair exam evaluator marking written answers.

For every question you are given the QUESTION, the REFERENCE ANSWER written by
the hiring team, the CANDIDATE ANSWER, and the MAXIMUM MARKS for that question.

Mark each answer on how well it covers the substance of the reference answer.
Wording does not have to match: reward correct understanding expressed
differently, and do not reward padding, repetition or confident nonsense. An
empty or irrelevant answer scores 0.

Return ONLY a JSON object with exactly these keys:
{
  "results": [
    {
      "question_id": "<exactly the id you were given>",
      "marks_awarded": <integer, 0 to that question's maximum>,
      "max_marks": <exactly the maximum you were given for that question>,
      "feedback": "<one sentence explaining the mark>"
    }
  ],
  "total_marks_awarded": <integer, the sum of all marks_awarded>,
  "total_marks_possible": <integer, the sum of all max_marks>
}

Rules:
- Return exactly one result for every question you were given, no more, no fewer.
- Echo every question_id and max_marks exactly as given.
- marks_awarded is a whole number and never exceeds max_marks.
- The totals must be the arithmetic sums of the individual results.
- Do not output markdown.
- Do not output prose outside the JSON object."""


def _build_answer_prompt(items: list[dict]) -> str:
    blocks = []
    for i, it in enumerate(items, start=1):
        blocks.append(
            f"--- QUESTION {i} ---\n"
            f"question_id: {it['question_id']}\n"
            f"MAXIMUM MARKS: {it['max_marks']}\n"
            f"QUESTION:\n{it['question']}\n\n"
            f"REFERENCE ANSWER:\n{it['reference_answer']}\n\n"
            f"CANDIDATE ANSWER:\n{it['candidate_answer'] or '(no answer given)'}")
    return ("Mark each of the following answers.\n\n" + "\n\n".join(blocks) +
            f"\n\nReturn exactly {len(items)} results.")


def validate_answer_scores(raw: dict, items: list[dict]) -> dict:
    """
    Check the reply against what was actually submitted.

    The stored maximum is authoritative: if the model returns a different
    max_marks for a question it is rejected rather than trusted, so a model
    that inflates the denominator cannot inflate the score.
    """
    result = ExamScoreResult(**raw)
    expected = {it["question_id"]: int(it["max_marks"]) for it in items}
    seen: set[str] = set()
    for r in result.results:
        if r.question_id not in expected:
            raise ValueError(f"unexpected question_id {r.question_id!r}")
        if r.question_id in seen:
            raise ValueError(f"duplicate result for {r.question_id!r}")
        if r.max_marks != expected[r.question_id]:
            raise ValueError(
                f"{r.question_id}: max_marks {r.max_marks} does not match the "
                f"stored {expected[r.question_id]}")
        seen.add(r.question_id)
    missing = sorted(set(expected) - seen)
    if missing:
        raise ValueError(f"no result for: {missing}")
    return result.model_dump(mode="json")


def score_answers(items: list[dict]) -> dict:
    """
    Mark a whole paper.

    One call for the paper rather than one per question: the marking of each
    answer is independent, but N separate calls could not fit in a single
    invocation, and the per-question contract is preserved by validating every
    result against its own question and maximum.
    """
    if not items:
        raise LLMError("cannot score an empty exam")
    user = _build_answer_prompt(items)
    # Feedback strings dominate the output, so scale with the paper length.
    max_tokens = min(8000, 2000 + 250 * len(items))

    def compute() -> dict:
        return _call_validated(
            ANSWER_SYSTEM, user, max_tokens,
            lambda raw: validate_answer_scores(raw, items),
            "answer scoring")

    return cache.get_or_compute(
        "answer_score",
        {"batch": [{"q": it["question_id"], "a": (it["candidate_answer"] or "")[:2000]}
                   for it in items]},
        compute, ttl_seconds=86400)
