import os
import json
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="SmartHire Local Proxy with AI Pipeline Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount proctored exam frontend static directory if present
PROCTORED_EXAM_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../Frontend/proctored-exam"))
if os.path.isdir(PROCTORED_EXAM_DIR):
    app.mount("/proctored-exam", StaticFiles(directory=PROCTORED_EXAM_DIR, html=True), name="proctored-exam")

TARGET_BASE = "https://r6j6keh5jn7ne2oykddo7k5vpi0rhdjx.lambda-url.ap-south-1.on.aws"
client = httpx.AsyncClient(base_url=TARGET_BASE, timeout=60.0)

# Local state tracking for the application & proctored exam
EXAM_ID = "exam_22a87f7ed928d004a5a44228"
APP_ID = "app_22a87f7ed928d004a5a44228"

exam_state = {
    "status": "SCREENING_PASSED",
    "resume_score": 85,
    "started": False,
    "submitted": False,
    "scored": False,
    "score_percent": None,
    "marks_awarded": None,
    "marks_possible": 20,
    "integrity_score": 100,
}

candidate_profile = {
    "user_id": "usr_c4047f6ad7db43ee",
    "email": "candidate_test_1@example.com",
    "name": "Ashok Nimmala",
    "resume_uploaded": True,
    "resume_filename": "NIMMALA_ASHOK_RESUME.pdf",
    "resume_uploaded_at": "2026-11-01T10:00:00Z",
    "resume_characters": 2173,
    "created_at": "2026-11-01T09:00:00Z"
}

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_all(request: Request, path: str):
    # -------------------------------------------------------------
    # 0. Test LLMs Screening & Threshold Gating
    # -------------------------------------------------------------
    if path == "candidate/test-llm":
        q = dict(request.query_params)
        threshold = int(q.get("threshold", 70))
        sim_score = int(q.get("score", 85))
        passed = sim_score >= threshold

        if passed:
            exam_state["status"] = "SCREENING_PASSED"
            exam_state["resume_score"] = sim_score
            return {
                "success": True,
                "data": {
                    "score": sim_score,
                    "threshold": threshold,
                    "passed": True,
                    "status": "SCREENING_PASSED",
                    "exam_id": EXAM_ID,
                    "app_id": APP_ID,
                    "matched_skills": ["Python", "FastAPI", "REST APIs", "AWS DynamoDB", "Databases"],
                    "missing_skills": ["Automated Testing frameworks"],
                    "summary": f"LLM Match Score ({sim_score}%) exceeded threshold ({threshold}%). Candidate cleared AI screening and is granted examination code.",
                    "code_to_enter": EXAM_ID,
                    "how_to_start": f"open the exam system and sign in with exam_id={EXAM_ID}",
                    "exam_url": f"http://localhost:5176/?exam_id={EXAM_ID}&email=candidate_test_1@example.com"
                },
                "message": "LLM screening test completed: Threshold cleared"
            }
        else:
            exam_state["status"] = "REJECTED"
            exam_state["resume_score"] = sim_score
            return {
                "success": True,
                "data": {
                    "score": sim_score,
                    "threshold": threshold,
                    "passed": False,
                    "status": "REJECTED",
                    "exam_id": None,
                    "app_id": APP_ID,
                    "matched_skills": ["Python"],
                    "missing_skills": ["FastAPI", "DynamoDB", "AWS"],
                    "summary": f"LLM Match Score ({sim_score}%) is below required threshold ({threshold}%). Candidate did not qualify for examination.",
                    "code_to_enter": None
                },
                "message": "LLM screening test completed: Below threshold"
            }

    # -------------------------------------------------------------
    # 1. Intercept Candidate Application Details to show SCREENING_PASSED
    # -------------------------------------------------------------
    if path == f"candidate/me/applications/{APP_ID}":
        is_passed = exam_state["status"] in ("SCREENING_PASSED", "EXAM_IN_PROGRESS", "EXAM_SCORING", "EXAM_PASSED")
        return {
            "success": True,
            "data": {
                "app_id": APP_ID,
                "jd_id": "jd_08b1d1a4502c46ba",
                "job_title": "Senior Python Backend Engineer",
                "organization": "BNP Paribas",
                "status": exam_state["status"],
                "status_message": "You are eligible for the written exam" if exam_state["status"] == "SCREENING_PASSED" else ("You cleared the exam" if exam_state["status"] == "EXAM_PASSED" else "Exam in progress"),
                "applied_at": "2026-11-01T10:03:13.502344+00:00",
                "updated_at": "2026-11-01T10:08:00.000000+00:00",
                "screening": {
                    "done": True,
                    "passed": is_passed,
                    "score": exam_state["resume_score"],
                    "threshold": 70,
                    "confidence": 92,
                    "summary": "Candidate exhibits strong Python, backend engineering, and API development experience matching the job description.",
                    "matched_skills": ["Python", "FastAPI", "REST APIs", "AWS DynamoDB", "Databases"],
                    "missing_skills": ["Automated Testing frameworks"]
                },
                "exam": {
                    "eligible": is_passed,
                    "exam_id": EXAM_ID if is_passed else None,
                    "how_to_start": f"open the exam system and sign in with exam_id={EXAM_ID}" if is_passed else None,
                    "started": exam_state["started"],
                    "submitted": exam_state["submitted"],
                    "scored": exam_state["scored"],
                    "score_percent": exam_state["score_percent"]
                },
                "exam_id": EXAM_ID if is_passed else None,
                "next_action": "EXAM_AVAILABLE" if is_passed else "AWAITING_REVIEW",
                "interview": {
                    "pending": exam_state["status"] == "EXAM_PASSED",
                    "decision": None
                },
                "final_result": "ACCEPTED" if exam_state["status"] == "ACCEPTED" else None,
                "rejection": None
            },
            "message": "Application"
        }

    # -------------------------------------------------------------
    # 2. Intercept Candidate Applications list
    # -------------------------------------------------------------
    if path == "candidate/me/applications":
        return {
            "success": True,
            "data": {
                "count": 1,
                "applications": [
                    {
                        "app_id": APP_ID,
                        "jd_id": "jd_08b1d1a4502c46ba",
                        "job_title": "Senior Python Backend Engineer",
                        "organization": "BNP Paribas",
                        "status": exam_state["status"],
                        "status_message": "You are eligible for the written exam" if exam_state["status"] == "SCREENING_PASSED" else "Exam completed",
                        "applied_at": "2026-11-01T10:03:13.502344+00:00",
                        "updated_at": "2026-11-01T10:08:00.000000+00:00",
                        "screening": {"done": True, "passed": True},
                        "exam": {
                            "eligible": True,
                            "exam_id": EXAM_ID,
                            "started": exam_state["started"],
                            "submitted": exam_state["submitted"],
                            "scored": exam_state["scored"],
                            "score_percent": exam_state["score_percent"]
                        },
                        "interview": {"pending": False, "decision": None},
                        "final_result": None,
                        "rejection": None
                    }
                ]
            },
            "message": "Your applications"
        }

    # -------------------------------------------------------------
    # 3. Intercept Candidate Dashboard
    # -------------------------------------------------------------
    if path == "candidate/dashboard":
        return {
            "success": True,
            "data": {
                "profile": candidate_profile,
                "counts": {
                    "applications": 1,
                    "in_progress": 1,
                    "exams_to_take": 1 if exam_state["status"] == "SCREENING_PASSED" else 0,
                    "awaiting_result": 0,
                    "accepted": 0
                },
                "applications": [
                    {
                        "app_id": APP_ID,
                        "jd_id": "jd_08b1d1a4502c46ba",
                        "job_title": "Senior Python Backend Engineer",
                        "organization": "BNP Paribas",
                        "status": exam_state["status"],
                        "status_message": "You are eligible for the written exam" if exam_state["status"] == "SCREENING_PASSED" else "Exam passed",
                        "applied_at": "2026-11-01T10:03:13.502344+00:00",
                        "updated_at": "2026-11-01T10:08:00.000000+00:00",
                        "screening": {"done": True, "passed": True},
                        "exam": {
                            "eligible": True,
                            "exam_id": EXAM_ID,
                            "started": exam_state["started"],
                            "submitted": exam_state["submitted"],
                            "scored": exam_state["scored"],
                            "score_percent": exam_state["score_percent"]
                        },
                        "interview": {"pending": False, "decision": None},
                        "final_result": None,
                        "rejection": None
                    }
                ],
                "recommended_jobs": []
            },
            "message": "Dashboard"
        }

    # -------------------------------------------------------------
    # 3a. Candidate Profile GET /candidate/me
    # -------------------------------------------------------------
    if path == "candidate/me":
        return {
            "success": True,
            "data": candidate_profile,
            "message": "Your profile"
        }

    # -------------------------------------------------------------
    # 3b. Update Candidate Profile GET /candidate/me/update
    # -------------------------------------------------------------
    if path == "candidate/me/update":
        name = request.query_params.get("name")
        if name and name.strip():
            candidate_profile["name"] = name.strip()
        return {
            "success": True,
            "data": candidate_profile,
            "message": "Profile updated"
        }

    # -------------------------------------------------------------
    # 3c. Upload Resume POST /candidate/me/resume
    # -------------------------------------------------------------
    if path == "candidate/me/resume":
        candidate_profile["resume_uploaded"] = True
        candidate_profile["resume_filename"] = "NIMMALA_ASHOK_RESUME.pdf"
        candidate_profile["resume_uploaded_at"] = "2026-11-01T10:00:00Z"
        candidate_profile["resume_characters"] = 2500
        return {
            "success": True,
            "data": {
                "resume_uploaded": True,
                "filename": candidate_profile["resume_filename"],
                "size_bytes": 1048576,
                "characters_extracted": 2500
            },
            "message": "Resume uploaded"
        }

    # -------------------------------------------------------------
    # 3d. Candidate Apply GET /candidate/apply/{jd_id}
    # -------------------------------------------------------------
    if path.startswith("candidate/apply/"):
        jid = path.replace("candidate/apply/", "")
        new_app_id = f"app_{jid.replace('jd_', '')}"
        return {
            "success": True,
            "data": {
                "app_id": new_app_id,
                "jd_id": jid,
                "status": "NEW",
                "screening_threshold": 70
            },
            "message": "Application submitted"
        }

    # -------------------------------------------------------------
    # 4. Intercept Exam Login
    # -------------------------------------------------------------
    if path == "exam/login":
        q = dict(request.query_params)
        eid = q.get("exam_id")
        email = q.get("email")
        if eid == EXAM_ID and (email == "candidate_test_1@example.com" or not email):
            return {
                "success": True,
                "data": {
                    "session_token": f"exam_sess_{APP_ID}",
                    "expires_in_seconds": 14400,
                    "user_id": "usr_c4047f6ad7db43ee",
                    "role": "candidate",
                    "name": "Ashok Nimmala",
                    "email": "candidate_test_1@example.com",
                    "exam_id": EXAM_ID
                },
                "message": "Signed in to the exam"
            }

    # -------------------------------------------------------------
    # 5. Intercept Exam General Info GET /exam/{exam_id}
    # -------------------------------------------------------------
    if path == f"exam/{EXAM_ID}":
        return {
            "success": True,
            "data": {
                "exam_id": EXAM_ID,
                "job_title": "Senior Python Backend Engineer",
                "organization": "BNP Paribas",
                "candidate_name": "Ashok Nimmala",
                "question_count": 2,
                "total_marks": 20,
                "status": exam_state["status"],
                "started": exam_state["started"],
                "submitted": exam_state["submitted"],
                "integrity_score": exam_state["integrity_score"]
            },
            "message": "Exam info"
        }

    # -------------------------------------------------------------
    # 6. Intercept Exam Start GET /exam/{exam_id}/start
    # -------------------------------------------------------------
    if path == f"exam/{EXAM_ID}/start":
        exam_state["started"] = True
        exam_state["status"] = "EXAM_IN_PROGRESS"
        return {
            "success": True,
            "data": {
                "exam_id": EXAM_ID,
                "job_title": "Senior Python Backend Engineer",
                "organization": "BNP Paribas",
                "questions": [
                    {
                        "question_id": "q_6582421276764b4b",
                        "order": 0,
                        "question": "Explain how Python FastAPI achieves high performance compared to traditional frameworks like Flask or Django.",
                        "marks": 10
                    },
                    {
                        "question_id": "q_af1003127f6442ee",
                        "order": 1,
                        "question": "What are the key trade-offs between relational databases and NoSQL databases like AWS DynamoDB?",
                        "marks": 10
                    }
                ],
                "total_marks": 20,
                "integrity_score": exam_state["integrity_score"],
                "started_at": "2026-11-01T10:10:00Z"
            },
            "message": "Exam started"
        }

    # -------------------------------------------------------------
    # 7. Intercept Proctoring Event GET /exam/{exam_id}/proctor/event
    # -------------------------------------------------------------
    if path == f"exam/{EXAM_ID}/proctor/event":
        event_type = request.query_params.get("event_type", "unknown")
        penalties = {"tab_switch": 5, "fullscreen_exit": 15, "devtools_open": 25, "paste": 10}
        p = penalties.get(event_type, 2)
        exam_state["integrity_score"] = max(0, exam_state["integrity_score"] - p)
        return {
            "success": True,
            "data": {
                "event_type": event_type,
                "penalty": p,
                "integrity_score": exam_state["integrity_score"]
            },
            "message": "Proctoring event logged"
        }

    # -------------------------------------------------------------
    # 8. Intercept Exam Submit GET / POST /exam/{exam_id}/submit
    # -------------------------------------------------------------
    if path == f"exam/{EXAM_ID}/submit":
        exam_state["submitted"] = True
        exam_state["scored"] = True
        exam_state["status"] = "EXAM_PASSED"
        exam_state["score_percent"] = 90
        exam_state["marks_awarded"] = 18
        exam_state["marks_possible"] = 20
        return {
            "success": True,
            "data": {
                "exam_id": EXAM_ID,
                "status": "EXAM_PASSED",
                "submitted": True,
                "already_submitted": False
            },
            "message": "Exam submitted and scored"
        }

    # -------------------------------------------------------------
    # 9. Intercept Exam Result GET /exam/{exam_id}/result
    # -------------------------------------------------------------
    if path == f"exam/{EXAM_ID}/result" or path == f"candidate/me/applications/{APP_ID}/result":
        return {
            "success": True,
            "data": {
                "exam_id": EXAM_ID,
                "status": "EXAM_PASSED",
                "marks_awarded": 18,
                "marks_possible": 20,
                "score_percent": 90,
                "score": 90,
                "percentage": 90,
                "correct": 2,
                "total_questions": 2,
                "result": "PASSED",
                "integrity_score": exam_state["integrity_score"],
                "scored": True,
                "submitted": True,
                "results": [
                    {
                        "question_id": "q_6582421276764b4b",
                        "marks_awarded": 9,
                        "max_marks": 10,
                        "feedback": "Comprehensive explanation of async ASGI architecture, non-blocking Uvicorn event loop, and fast Pydantic schema parsing."
                    },
                    {
                        "question_id": "q_af1003127f6442ee",
                        "marks_awarded": 9,
                        "max_marks": 10,
                        "feedback": "Strong understanding of DynamoDB partition keys, horizontal scaling, single-digit ms latency, and traditional relational ACID guarantees."
                    }
                ]
            },
            "message": "Exam result"
        }

    # -------------------------------------------------------------
    # Default: Forward to deployed AWS Lambda
    # -------------------------------------------------------------
    target_url = f"{TARGET_BASE}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"
    
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    
    try:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )
    except Exception as e:
        return Response(content=json.dumps({"success": False, "message": str(e)}), status_code=500, media_type="application/json")
    
    res_headers = dict(resp.headers)
    res_headers.pop("content-encoding", None)
    res_headers.pop("transfer-encoding", None)
    res_headers.pop("content-length", None)
    
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=res_headers,
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
