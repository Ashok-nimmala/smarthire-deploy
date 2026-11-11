"""
test_smoke.py
-------------
Offline self-checks. No network, no AWS, no credentials: everything here is
either pure arithmetic, the state machine, or the app's own route table.

    python3 test_smoke.py

Anything that needs the live stack lives in the Postman collection instead.
"""

from __future__ import annotations

import json as _json
import os
import re as _re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("AWS_REGION", "ap-south-1")

import config                                                   # noqa: E402
from models import (                                            # noqa: E402
    STATE_MACHINE,
    ApplicationStatus,
    app_id_for,
    auto_flags,
    combined_score,
    exam_id_for,
    exam_percent,
    jd_is_expired,
    jd_is_open,
    ok,
    screening_outcome,
)

PASSES: list[str] = []


def check(label: str, fn) -> None:
    fn()
    PASSES.append(label)
    print(f"  ok  {label}")


# ---------------------------------------------------------------------------
print("state machine")
# ---------------------------------------------------------------------------

def _every_status_is_in_the_graph():
    for s in ApplicationStatus:
        assert s.value in STATE_MACHINE, f"{s.value} has no entry"
    for src, targets in STATE_MACHINE.items():
        assert src in {s.value for s in ApplicationStatus}, src
        for t in targets:
            assert t in {s.value for s in ApplicationStatus}, f"{src} -> {t}"


def _the_happy_path_is_walkable():
    path = ["NEW", "SCREENING", "SCREENING_PASSED", "EXAM_IN_PROGRESS",
            "EXAM_SCORING", "EXAM_PASSED", "INTERVIEW_PENDING", "ACCEPTED"]
    for a, b in zip(path, path[1:]):
        assert b in STATE_MACHINE[a], f"{a} -> {b} is not allowed"


def _the_hold_path_is_walkable():
    for a, b in (("SCREENING", "HOLD"), ("HOLD", "SCREENING_PASSED"),
                 ("HOLD", "REJECTED"), ("REJECTED", "SCREENING")):
        assert b in STATE_MACHINE[a], f"{a} -> {b} is not allowed"


def _terminal_states_are_terminal():
    for s in ("ACCEPTED", "FINAL_REJECTED", "EXAM_REJECTED"):
        assert STATE_MACHINE[s] == set(), f"{s} should be terminal"


def _the_exam_cannot_be_reached_without_clearing_screening():
    """The whole point of the pipeline: no shortcut into the exam."""
    for s in ("NEW", "SCREENING", "HOLD", "REJECTED"):
        assert "EXAM_IN_PROGRESS" not in STATE_MACHINE[s], \
            f"{s} must not reach the exam"
    # And nothing jumps to a decision without an interview.
    for s in STATE_MACHINE:
        if s != "INTERVIEW_PENDING":
            assert "ACCEPTED" not in STATE_MACHINE[s], f"{s} -> ACCEPTED"


def _screening_can_be_handed_back_when_the_ai_is_unreachable():
    """
    An application must never be stranded.

    One AI call fills most of an invocation, so the redelivery is the retry.
    When every delivery fails, the worker puts the application back to NEW,
    which is a state the admin's re-screen endpoint accepts - otherwise a
    gateway outage would leave it in SCREENING with no way out.
    """
    assert "NEW" in STATE_MACHINE["SCREENING"], \
        "a stuck screening has no way back"
    import sqs_worker
    assert sqs_worker.MAX_DELIVERIES >= 2, sqs_worker.MAX_DELIVERIES
    # The re-screen endpoint must accept whatever the worker hands back.
    import inspect
    import admin
    source = inspect.getsource(admin.rescreen)
    assert "ApplicationStatus.NEW.value" in source, \
        "re-screen no longer accepts the state the worker hands back"


def _removed_statuses_are_gone():
    """The old scheduling vocabulary must not come back."""
    for gone in ("INTERVIEW_SCHEDULED", "ON_HOLD", "NO_SHOW", "WITHDRAWN",
                 "QA_SCORING", "EXAM_HOLD", "PASSED"):
        assert gone not in STATE_MACHINE, f"{gone} is still in the state machine"
        assert gone not in {s.value for s in ApplicationStatus}, \
            f"{gone} is still a status"


check("every status appears in the graph", _every_status_is_in_the_graph)
check("the happy path walks end to end", _the_happy_path_is_walkable)
check("the hold and re-screen paths walk", _the_hold_path_is_walkable)
check("terminal states have no way out", _terminal_states_are_terminal)
check("the exam cannot be reached without clearing screening",
      _the_exam_cannot_be_reached_without_clearing_screening)
check("scheduling-era statuses are gone", _removed_statuses_are_gone)
check("a screening the AI could not finish is handed back, not stranded",
      _screening_can_be_handed_back_when_the_ai_is_unreachable)


# ---------------------------------------------------------------------------
print("\nscreening")
# ---------------------------------------------------------------------------

def _screening_splits_three_ways():
    # threshold 70, band 15 -> pass >=70, hold 55..69, reject <55
    assert screening_outcome(70, 70, 15) is ApplicationStatus.SCREENING_PASSED
    assert screening_outcome(85, 70, 15) is ApplicationStatus.SCREENING_PASSED
    assert screening_outcome(69, 70, 15) is ApplicationStatus.HOLD
    assert screening_outcome(55, 70, 15) is ApplicationStatus.HOLD
    assert screening_outcome(54, 70, 15) is ApplicationStatus.REJECTED
    assert screening_outcome(0, 70, 15) is ApplicationStatus.REJECTED


def _the_threshold_is_per_job():
    # The same score lands differently under two different JD thresholds.
    assert screening_outcome(60, 50, 15) is ApplicationStatus.SCREENING_PASSED
    assert screening_outcome(60, 90, 15) is ApplicationStatus.REJECTED


def _a_zero_band_means_no_hold_at_all():
    assert screening_outcome(69, 70, 0) is ApplicationStatus.REJECTED
    assert screening_outcome(70, 70, 0) is ApplicationStatus.SCREENING_PASSED


def _the_band_never_goes_below_zero():
    # A band wider than the threshold must not make a negative floor.
    assert screening_outcome(0, 10, 50) is ApplicationStatus.HOLD


check("screening splits pass / hold / reject at its boundaries",
      _screening_splits_three_ways)
check("the threshold is the job's, not the platform's", _the_threshold_is_per_job)
check("a zero band removes the hold state entirely",
      _a_zero_band_means_no_hold_at_all)
check("a band wider than the threshold floors at zero",
      _the_band_never_goes_below_zero)


# ---------------------------------------------------------------------------
print("\nexam scoring")
# ---------------------------------------------------------------------------

def _exam_percent_is_marks_over_the_whole_paper():
    assert exam_percent(25, 25) == 100
    assert exam_percent(0, 25) == 0
    assert exam_percent(24, 25) == 96
    assert exam_percent(13, 25) == 52
    # An unanswered question costs marks; it does not shrink the paper.
    assert exam_percent(10, 25) == 40


def _exam_percent_survives_an_empty_paper():
    assert exam_percent(0, 0) == 0


def _combined_score_arithmetic():
    # weights 40/60 by default, integrity as a multiplier
    assert combined_score(100, 100, 100, 40, 60) == 100
    assert combined_score(50, 100, 100, 40, 60) == 80
    assert combined_score(100, 50, 100, 40, 60) == 70
    # integrity scales the whole thing
    assert combined_score(100, 100, 85, 40, 60) == 85
    assert combined_score(100, 100, 0, 40, 60) == 0


def _combined_score_is_clamped():
    assert 0 <= combined_score(100, 100, 200, 100, 100) <= 100
    assert combined_score(0, 0, 100, 40, 60) == 0


def _no_score_is_ever_a_float():
    for fn, args in ((exam_percent, (7, 25)),
                     (combined_score, (73, 61, 88, 40, 60))):
        assert isinstance(fn(*args), int), fn


def _flags_are_advisory_and_specific():
    assert auto_flags(90, 90, 100, 95) == []
    assert "low_resume_confidence" in auto_flags(90, 90, 100, 10)
    assert "resume_exam_disagreement" in auto_flags(95, 30, 100, 95)
    assert "low_integrity_score" in auto_flags(90, 90, 20, 95)


check("exam percent is marks over the whole paper",
      _exam_percent_is_marks_over_the_whole_paper)
check("an empty paper scores zero, not a crash",
      _exam_percent_survives_an_empty_paper)
check("the combined score weights both stages and scales by integrity",
      _combined_score_arithmetic)
check("the combined score stays inside 0-100", _combined_score_is_clamped)
check("no score is ever a float", _no_score_is_ever_a_float)
check("auto-flags name the right reason", _flags_are_advisory_and_specific)


# ---------------------------------------------------------------------------
print("\nexam ids, expiry and storage")
# ---------------------------------------------------------------------------

def _exam_ids_round_trip():
    app_id = "app_b74e1c176306d94bf7c7424a"
    exam_id = exam_id_for(app_id)
    assert exam_id.startswith("exam_"), exam_id
    assert app_id_for(exam_id) == app_id
    assert exam_id_for(app_id_for(exam_id)) == exam_id
    # The exam id must not BE the app id: the two systems keep their own ids.
    assert exam_id != app_id


def _expiry_closes_a_job_everywhere():
    live = {"is_live": "true", "expires_epoch": 4102444800}     # 2100
    past = {"is_live": "true", "expires_epoch": 1000000000}     # 2001
    assert jd_is_open(live) and not jd_is_expired(live)
    assert jd_is_expired(past) and not jd_is_open(past)
    assert not jd_is_open({"is_live": "false", "expires_epoch": 4102444800})
    assert not jd_is_open({"is_live": "true", "expires_epoch": 4102444800,
                           "deleted": True})
    assert not jd_is_open(None)


def _floats_are_refused_by_the_storage_layer():
    import db
    db._to_ddb({"score": 87})                       # ints are fine
    for bad in (0.5, {"score": 0.95}, [1, 2.5]):
        try:
            db._to_ddb(bad)
        except db.FloatRefused:
            continue
        raise AssertionError(f"{bad!r} should have been refused")


def _the_envelope_is_always_the_same_shape():
    assert ok({"a": 1}, "hi") == {"success": True, "data": {"a": 1}, "message": "hi"}
    assert ok() == {"success": True, "data": {}, "message": ""}


check("exam ids round-trip to application ids", _exam_ids_round_trip)
check("expiry closes a job on every path", _expiry_closes_a_job_everywhere)
check("the storage layer refuses floats", _floats_are_refused_by_the_storage_layer)
check("the success envelope is one shape", _the_envelope_is_always_the_same_shape)


# ---------------------------------------------------------------------------
print("\nconfiguration")
# ---------------------------------------------------------------------------

def _config_clamps_and_falls_back():
    os.environ["SCREENING_HOLD_BAND"] = "999"
    assert config.screening_hold_band() == 100
    os.environ["SCREENING_HOLD_BAND"] = "-4"
    assert config.screening_hold_band() == 0
    os.environ["SCREENING_HOLD_BAND"] = "banana"
    assert config.screening_hold_band() == 15
    del os.environ["SCREENING_HOLD_BAND"]


def _penalties_are_centralised_and_complete():
    p = config.proctor_penalties()
    for event in ("tab_switch", "fullscreen_exit", "copy", "paste",
                  "right_click", "devtools_open", "multiple_faces", "no_face",
                  "network_drop"):
        assert event in p, f"{event} has no penalty"
        assert isinstance(p[event], int) and p[event] >= 0


def _no_rate_limit_is_hard_coded():
    """
    Every limit must come from config, so it can be retuned without a deploy.

    A literal in a check_rate() call is the failure this catches: it looks
    harmless until the day it has to change on a live system.
    """
    import inspect
    import auth, candidate, exam                              # noqa: E401
    for module in (auth, candidate, exam):
        for line in inspect.getsource(module).splitlines():
            if "check_rate(" in line or "limit=config" in line:
                assert not _re.search(r"limit=\d", line), \
                    f"{module.__name__} hard-codes a rate limit: {line.strip()}"


def _an_unknown_penalty_key_is_ignored():
    os.environ["PROCTOR_PENALTIES"] = '{"paste": 15, "telepathy": 99}'
    p = config.proctor_penalties()
    assert p["paste"] == 15
    assert "telepathy" not in p
    os.environ["PROCTOR_PENALTIES"] = "not json"
    assert config.proctor_penalties()["paste"] == 10
    del os.environ["PROCTOR_PENALTIES"]


check("config clamps out-of-range values and falls back on junk",
      _config_clamps_and_falls_back)
check("every proctoring event has a centrally defined penalty",
      _penalties_are_centralised_and_complete)
check("an unknown penalty key is ignored", _an_unknown_penalty_key_is_ignored)
check("no rate limit is hard-coded in a router", _no_rate_limit_is_hard_coded)


# ---------------------------------------------------------------------------
print("\nanswer-score validation")
# ---------------------------------------------------------------------------

def _validator_rejects_a_tampered_reply():
    import llm
    items = [{"question_id": "q_1", "max_marks": 10},
             {"question_id": "q_2", "max_marks": 5}]

    def reply(results, awarded=None, possible=None):
        return {"results": results,
                "total_marks_awarded": sum(r["marks_awarded"] for r in results)
                if awarded is None else awarded,
                "total_marks_possible": sum(r["max_marks"] for r in results)
                if possible is None else possible}

    good = [{"question_id": "q_1", "marks_awarded": 8, "max_marks": 10, "feedback": "x"},
            {"question_id": "q_2", "marks_awarded": 5, "max_marks": 5, "feedback": "y"}]
    out = llm.validate_answer_scores(reply(good), items)
    assert out["total_marks_awarded"] == 13

    bad_cases = {
        "a question the paper never had": [
            good[0], {"question_id": "q_9", "marks_awarded": 5, "max_marks": 5,
                      "feedback": ""}],
        "a missing question": [good[0]],
        "a duplicated question": [good[0], good[0]],
        "an inflated maximum": [
            good[0], {"question_id": "q_2", "marks_awarded": 50, "max_marks": 50,
                      "feedback": ""}],
        "marks above the maximum": [
            {"question_id": "q_1", "marks_awarded": 99, "max_marks": 10,
             "feedback": ""}, good[1]],
    }
    for label, results in bad_cases.items():
        try:
            llm.validate_answer_scores(reply(results), items)
        except Exception:
            continue
        raise AssertionError(f"{label} should have been rejected")

    # Totals that do not add up are rejected even when every row is fine.
    try:
        llm.validate_answer_scores(reply(good, awarded=99), items)
    except Exception:
        pass
    else:
        raise AssertionError("a wrong total should have been rejected")


check("the marker's reply is validated against the stored paper",
      _validator_rejects_a_tampered_reply)


# ---------------------------------------------------------------------------
print("\nrouting")
# ---------------------------------------------------------------------------

def _app_routes():
    os.environ.setdefault("JWT_SECRET", "unused")
    import main
    from fastapi.routing import APIRoute
    return main.app, [r for r in main.app.routes if isinstance(r, APIRoute)]


SKIP_PATHS = ("/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc")

# The two operations the method rules allow to be POST, and nothing else.
ALLOWED_POSTS = {"/candidate/me/resume", "/exam/{exam_id}/submit"}


def _live_operations() -> set:
    _, routes = _app_routes()
    return {(m, r.path) for r in routes for m in r.methods
            if m not in ("HEAD", "OPTIONS") and r.path not in SKIP_PATHS}


def _resolves(routes, method, path):
    from starlette.routing import Match
    scope = {"type": "http", "method": method, "path": path, "path_params": {},
             "headers": [], "query_string": b"", "root_path": ""}
    return any(r.matches(scope)[0] == Match.FULL for r in routes)


def _get_first_convention_holds():
    """
    The project's method rule, enforced mechanically.

    GET for everything; POST only where a GET genuinely cannot carry the
    payload (a PDF upload, and a written paper too long for a URL); and no
    PATCH, PUT or DELETE anywhere at all.
    """
    offenders = {"POST": [], "PATCH": [], "PUT": [], "DELETE": []}
    for method, path in _live_operations():
        if method in ("PATCH", "PUT", "DELETE"):
            offenders[method].append(path)
        elif method == "POST" and path not in ALLOWED_POSTS:
            offenders["POST"].append(path)
    assert not any(offenders.values()), \
        "these routes break the GET-first rule: " + _json.dumps(offenders)


def _no_duplicate_paths():
    import collections
    _, routes = _app_routes()
    pairs = [(m, r.path) for r in routes for m in sorted(r.methods) if m != "HEAD"]
    dupes = [k for k, v in collections.Counter(pairs).items() if v > 1]
    assert not dupes, f"duplicate method+path: {dupes}"


def _removed_endpoints_stay_removed():
    """Everything the specification deletes must not be reachable."""
    _, routes = _app_routes()
    gone = [
        ("POST", "/auth/logout"), ("POST", "/auth/refresh"),
        ("GET", "/auth/me"), ("POST", "/auth/change-password"),
        ("POST", "/auth/forgot-password"), ("POST", "/auth/reset-password"),
        ("GET", "/admin/org"), ("PATCH", "/admin/org"),
        ("POST", "/admin/seed"), ("GET", "/admin/seed"),
        ("POST", "/admin/jds/x/duplicate"), ("GET", "/admin/jds/x/duplicate"),
        ("POST", "/admin/questions/bulk"), ("GET", "/admin/questions/bulk"),
        ("POST", "/admin/applications/x/assign"),
        ("GET", "/admin/applications/x/assign"),
        ("POST", "/admin/applications/x/reschedule"),
        ("GET", "/admin/applications/x/reschedule"),
        ("POST", "/admin/applications/x/override"),
        ("GET", "/admin/applications/x/override"),
        ("POST", "/admin/applications/x/finalize"),
        ("GET", "/admin/applications/x/finalize"),
        ("POST", "/admin/applications/x/next-steps"),
        ("GET", "/admin/applications/x/invite"),
        ("GET", "/candidate/notifications"), ("GET", "/interviewer/notifications"),
        ("POST", "/candidate/devices/register"),
        ("GET", "/candidate/devices/register"),
        ("PATCH", "/admin/interviewers/x"),
    ]
    alive = [f"{m} {p}" for m, p in gone if _resolves(routes, m, p)]
    assert not alive, "these removed endpoints are still reachable: " + str(alive)


def _the_whole_specified_surface_exists():
    """Every endpoint the specification lists must actually be served."""
    _, routes = _app_routes()
    required = [
        ("GET", "/auth/signup/admin"), ("GET", "/auth/signup/candidate"),
        ("GET", "/auth/login"),
        ("GET", "/public/jobs"), ("GET", "/public/search"),
        ("GET", "/public/jobs/x"),
        ("GET", "/admin/dashboard"),
        ("GET", "/admin/jds"), ("GET", "/admin/jds/create"),
        ("GET", "/admin/jds/x"), ("GET", "/admin/jds/x/update"),
        ("GET", "/admin/jds/x/delete"), ("GET", "/admin/jds/x/publish"),
        ("GET", "/admin/jds/x/unpublish"), ("GET", "/admin/jds/x/extend-expiry"),
        ("GET", "/admin/jds/x/questions"), ("GET", "/admin/jds/x/questions/create"),
        ("GET", "/admin/questions/x/update"), ("GET", "/admin/questions/x/delete"),
        ("GET", "/admin/holds"),
        ("GET", "/admin/applications/x/hold/approve"),
        ("GET", "/admin/applications/x/hold/reject"),
        ("GET", "/admin/jds/x/screen"),
        ("GET", "/admin/jds/x/applications"), ("GET", "/admin/applications/x"),
        ("GET", "/admin/interviewers"), ("GET", "/admin/interviewers/create"),
        ("GET", "/admin/interviewers/x/delete"),
        ("GET", "/admin/jobs/batch/x"), ("GET", "/admin/jobs/failed"),
        ("GET", "/admin/audit/x"), ("GET", "/admin/flags"),
        ("GET", "/candidate/dashboard"), ("GET", "/candidate/me"),
        ("GET", "/candidate/me/update"), ("POST", "/candidate/me/resume"),
        ("GET", "/candidate/me/applications"), ("GET", "/candidate/apply/x"),
        ("GET", "/candidate/me/applications/x"),
        ("GET", "/interviewer/dashboard"), ("GET", "/interviewer/applications"),
        ("GET", "/interviewer/applications/x"),
        ("GET", "/interviewer/applications/x/notes"),
        ("GET", "/interviewer/applications/x/notes/add"),
        ("GET", "/interviewer/applications/x/decision"),
        ("GET", "/exam/login"), ("GET", "/exam/x"), ("GET", "/exam/x/start"),
        ("GET", "/exam/x/submit"), ("POST", "/exam/x/submit"),
        ("GET", "/exam/x/result"), ("GET", "/exam/x/proctor/event"),
    ]
    missing = [f"{m} {p}" for m, p in required if not _resolves(routes, m, p)]
    assert not missing, "the specification requires these, and they are missing: " \
        + str(missing)


def _markdown_table_endpoints(filename: str) -> list:
    """Pull every (method, path) pair out of a doc's markdown tables."""
    doc = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    if not os.path.exists(doc):
        return []
    pairs = []
    for line in open(doc):
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        path, methods = None, ""
        for cell in cells:
            bare = cell.replace("**", "").split(",")[0].strip()
            bare = bare.strip("`").split("?")[0].strip()
            if bare.startswith("/"):
                path = bare
                break
            methods += " " + cell
        if not path:
            continue
        path = _re.sub(r"\{[^}]+\}", "x", path).rstrip(".")
        if path.endswith("...") or "*" in path:
            continue
        for m in _re.findall(r"GET|POST|PATCH|DELETE|PUT", methods):
            pairs.append((m, path))
    return pairs


def _doc_endpoints_all_resolve(filename: str, minimum: int):
    pairs = _markdown_table_endpoints(filename)
    if not pairs:
        return
    _, routes = _app_routes()
    missing = sorted({f"{m} {p}" for m, p in pairs
                      if not _resolves(routes, m, p)})
    assert not missing, f"{filename} documents routes that do not exist:\n  " + \
        "\n  ".join(missing)
    assert len(pairs) >= minimum, \
        f"{filename}: only {len(pairs)} endpoint rows parsed, expected >= {minimum}"


def _api_doc_documents_every_endpoint():
    documented = set(_markdown_table_endpoints("API.md"))
    if not documented:
        return
    undocumented = sorted(
        f"{m} {p}" for m, p in _live_operations()
        if (m, _re.sub(r"\{[^}]+\}", "x", p)) not in documented)
    assert not undocumented, "API.md does not document:\n  " + "\n  ".join(undocumented)


def _postman_items(node) -> list:
    out = []
    for item in node:
        if "item" in item:
            out.extend(_postman_items(item["item"]))
        else:
            out.append(item)
    return out


def _load_collection():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "postman", "SmartHire.postman_collection.json")
    if not os.path.exists(path):
        return None
    return _json.load(open(path))


def _postman_requests_all_resolve():
    """
    Every request in the collection must hit a real route.

    `url` must be a plain string: as an object it also needs a `path` array,
    and without one Postman and Newman silently drop the path and send the
    request to baseUrl itself.
    """
    coll = _load_collection()
    if not coll:
        return
    _, routes = _app_routes()
    items = _postman_items(coll["item"])
    assert items, "the collection has no requests"
    structural = [i["name"] for i in items
                  if not isinstance(i["request"]["url"], str)]
    assert not structural, \
        "these requests carry a url OBJECT, whose path Postman will drop:\n  " + \
        "\n  ".join(structural)
    missing = []
    for item in items:
        url = item["request"]["url"].replace("{{baseUrl}}", "").split("?")[0]
        url = _re.sub(r"\{\{[^}]+\}\}", "x", url)
        if url and not _resolves(routes, item["request"]["method"], url):
            missing.append(f"{item['request']['method']} {url} ({item['name']!r})")
    assert not missing, "the collection references routes that do not exist:\n  " \
        + "\n  ".join(missing)


def _postman_covers_every_endpoint():
    coll = _load_collection()
    if not coll:
        return
    _, routes = _app_routes()
    from starlette.routing import Match
    covered = set()
    for item in _postman_items(coll["item"]):
        method = item["request"]["method"]
        url = item["request"]["url"].replace("{{baseUrl}}", "").split("?")[0]
        url = _re.sub(r"\{\{[^}]+\}\}", "x", url)
        scope = {"type": "http", "method": method, "path": url, "path_params": {},
                 "headers": [], "query_string": b"", "root_path": ""}
        for r in routes:
            if method in r.methods and r.matches(scope)[0] == Match.FULL:
                covered.add((method, r.path))
    gap = sorted(f"{m} {p}" for m, p in _live_operations() - covered)
    assert not gap, "the collection has no request for:\n  " + "\n  ".join(gap)


def _routing_errors_stay_inside_the_envelope():
    """
    An unknown path and a wrong method are raised by Starlette, not by our code,
    so they escape the envelope as a bare {"detail": ...} unless the handler is
    registered on Starlette's HTTPException. A client that only knows the
    envelope reads that as a success with no `success` key.
    """
    from fastapi.testclient import TestClient
    app, _ = _app_routes()
    client = TestClient(app, raise_server_exceptions=False)
    for method, path, status in (("GET", "/no/such/thing", 404),
                                 ("POST", "/health", 405),
                                 ("PUT", "/health", 405),
                                 ("DELETE", "/admin/jds", 405)):
        r = client.request(method, path)
        body = r.json()
        assert r.status_code == status, f"{method} {path} -> {r.status_code}"
        assert body.get("success") is False and "error" in body, \
            f"{method} {path} answered outside the envelope: {body}"
        assert "detail" not in body, f"{method} {path} leaked Starlette's shape"


def _the_system_prompts_are_never_edited():
    """
    The two prompts are the product. Speed work is allowed to change waits,
    retries and batching; it is not allowed to touch a single character of
    what the model is told. These hashes pin them.
    """
    import hashlib
    import llm
    for name, pinned in (("RESUME_SYSTEM", "1dbb14a358540ab7"),
                         ("ANSWER_SYSTEM", "327b207cd90aee16")):
        got = hashlib.sha256(getattr(llm, name).encode()).hexdigest()[:16]
        assert got == pinned, (
            f"{name} changed (sha {got}, pinned {pinned}). If that was "
            f"deliberate, update the pin here on purpose.")


def _the_gateway_is_never_asked_for_less_than_it_needs():
    """
    Measured: below GATEWAY_MIN_WAIT the gateway answers 503 without trying, so
    a call made with a smaller budget is a guaranteed failure that also burns an
    SQS delivery. It must raise instead of calling.
    """
    import llm
    waits = []

    def fake_gateway(system, user, max_output_tokens, wait_seconds):
        waits.append(wait_seconds)
        raise llm.GatewayBusy("gateway http 503")

    real = llm._call_gateway
    llm._call_gateway = fake_gateway
    try:
        try:
            llm._call_validated("sys", "usr", 100, lambda raw: raw, "test")
        except llm.LLMError:
            pass
    finally:
        llm._call_gateway = real
    assert waits, "no call was attempted at all"
    assert min(waits) >= llm.GATEWAY_MIN_WAIT, \
        f"called the gateway with only {min(waits)}s, floor is {llm.GATEWAY_MIN_WAIT}s"
    assert len(waits) >= 2, \
        f"a busy gateway got {len(waits)} attempt(s); the point is to retry in " \
        "this invocation rather than wait for a redelivery"
    assert len(waits) <= llm.MAX_ATTEMPTS, "attempts are not capped"


def _a_busy_gateway_retries_but_bad_json_gets_corrected():
    """The two failure kinds need opposite handling, so they must stay apart."""
    import llm
    seen = []

    def fake(system, user, max_output_tokens, wait_seconds):
        seen.append(system)
        if len(seen) == 1:
            raise llm.GatewayBusy("gateway http 503")
        return {"ok": 1}

    real = llm._call_gateway
    llm._call_gateway = fake
    try:
        llm._call_validated("SYSTEM", "usr", 100, lambda raw: raw, "test")
    finally:
        llm._call_gateway = real
    assert seen[1] == "SYSTEM", \
        "a busy gateway must be retried with the same prompt, not a corrected one"

    seen.clear()

    def fake_badjson(system, user, max_output_tokens, wait_seconds):
        seen.append(system)
        if len(seen) == 1:
            raise ValueError("not the right shape")
        return {"ok": 1}

    llm._call_gateway = fake_badjson
    try:
        llm._call_validated("SYSTEM", "usr", 100, lambda raw: raw, "test")
    finally:
        llm._call_gateway = real
    assert seen[1].startswith("SYSTEM") and "CRITICAL" in seen[1], \
        "a reply that did not validate must be retried with a correction"


def _the_interviewer_never_sees_a_system_rejection():
    import interviewer
    from models import ApplicationStatus as S
    hidden = interviewer.HIDDEN_FROM_INTERVIEWER
    assert S.REJECTED.value in hidden, "screening rejects still reach the interviewer"
    assert S.EXAM_REJECTED.value in hidden, "exam rejects still reach the interviewer"
    assert S.FINAL_REJECTED.value not in hidden, \
        "the interviewer's own decision must stay visible to them"
    assert S.INTERVIEW_PENDING.value not in hidden and S.ACCEPTED.value not in hidden
    # both entry points must filter, or the detail route leaks what the list hides
    import inspect
    for fn in (interviewer._mine, interviewer._assigned):
        assert "HIDDEN_FROM_INTERVIEWER" in inspect.getsource(fn), \
            f"{fn.__name__} does not filter"


def _a_rejected_candidate_is_told_why():
    import candidate
    from models import ApplicationStatus as S
    row = {"app_id": "app_1", "jd_id": "jd_1",
           "resume_ai": {"missing_skills": ["Kubernetes", "Go"], "score": 31,
                         "confidence": 88, "red_flags": ["short tenure"],
                         "summary": "internal evidence"},
           "exam_marks_awarded": 8, "exam_marks_possible": 25, "exam_score": 32,
           "decision_at": "2026-09-27T00:00:00+00:00"}

    for status, stage in ((S.REJECTED.value, "SCREENING"),
                          (S.EXAM_REJECTED.value, "EXAM"),
                          (S.FINAL_REJECTED.value, "INTERVIEW")):
        view = candidate._candidate_view({**row, "status": status})
        r = view["rejection"]
        assert r and r["stage"] == stage, f"{status} has no reason"
        assert r["reason"] and len(r["reason"]) > 20, f"{status} reason is not useful"
        leaked = _json.dumps(r)
        for secret in ("confidence", "red_flags", "internal evidence",
                       "threshold", "resume_score"):
            assert secret not in leaked, f"{status} leaks {secret}"
    missing = candidate._candidate_view({**row, "status": S.REJECTED.value})
    assert missing["rejection"]["missing_requirements"] == ["Kubernetes", "Go"]

    # every living application keeps rejection = None
    for status in (S.NEW.value, S.SCREENING.value, S.HOLD.value,
                   S.SCREENING_PASSED.value, S.EXAM_IN_PROGRESS.value,
                   S.EXAM_SCORING.value, S.EXAM_PASSED.value,
                   S.INTERVIEW_PENDING.value, S.ACCEPTED.value):
        assert candidate._candidate_view({**row, "status": status})["rejection"] is None, \
            f"{status} is not a rejection but carries a reason"


def _no_existing_response_field_was_dropped():
    """The contract the frontend already reads must survive, key for key."""
    import candidate
    import interviewer
    from models import ApplicationStatus as S
    before = {"app_id", "jd_id", "job_title", "organization", "status",
              "status_message", "applied_at", "updated_at", "screening", "exam",
              "interview", "final_result"}
    now = set(candidate._candidate_view({"app_id": "a", "jd_id": "j",
                                         "status": S.NEW.value}))
    assert before <= now, f"candidate view lost: {sorted(before - now)}"
    assert now - before == {"rejection"}, f"unexpected new keys: {sorted(now - before)}"

    row_before = {"app_id", "candidate_name", "candidate_email", "job_title",
                  "jd_id", "status", "resume_score", "exam_score",
                  "integrity_score", "combined_score", "decision",
                  "auto_flagged", "auto_flag_reasons", "applied_at", "updated_at"}
    row_now = set(interviewer._row({"app_id": "a"}))
    assert row_now == row_before, \
        f"interviewer row changed: added {sorted(row_now - row_before)}, " \
        f"lost {sorted(row_before - row_now)}"


check("GET-first: no PATCH/PUT/DELETE, and POST only where it must be",
      _get_first_convention_holds)
check("the two system prompts are byte-for-byte unchanged",
      _the_system_prompts_are_never_edited)
check("the gateway is never called with less budget than it needs",
      _the_gateway_is_never_asked_for_less_than_it_needs)
check("a busy gateway is retried, a bad reply is corrected",
      _a_busy_gateway_retries_but_bad_json_gets_corrected)
check("the interviewer never sees a system rejection",
      _the_interviewer_never_sees_a_system_rejection)
check("a rejected candidate is told why, without internal evidence",
      _a_rejected_candidate_is_told_why)
check("no existing response field was dropped",
      _no_existing_response_field_was_dropped)
check("an unknown path and a wrong method answer in the envelope",
      _routing_errors_stay_inside_the_envelope)
check("no two routes share a method and path", _no_duplicate_paths)
check("every endpoint the specification lists exists",
      _the_whole_specified_surface_exists)
check("every removed endpoint stays removed", _removed_endpoints_stay_removed)
check("every README endpoint resolves to a real route",
      lambda: _doc_endpoints_all_resolve("README.md", 40))
check("every API.md endpoint resolves to a real route",
      lambda: _doc_endpoints_all_resolve("API.md", 50))
check("API.md documents every live endpoint", _api_doc_documents_every_endpoint)
check("every Postman request resolves to a real route",
      _postman_requests_all_resolve)
check("the Postman collection covers every live endpoint",
      _postman_covers_every_endpoint)


print(f"\n{len(PASSES)} checks passed")
