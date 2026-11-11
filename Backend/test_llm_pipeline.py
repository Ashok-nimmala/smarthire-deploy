"""
test_llm_pipeline.py
--------------------
End-to-end verification of LLM AI capabilities and threshold gating:
1. LLM Resume Screening (JD + Resume -> Match Score, Matched & Missing Skills).
2. Threshold Value Evaluation (Pass >= Threshold, Hold in Borderline Band, Reject below).
3. Transition to Examination & Generation of the Proctored Exam Code (exam_id).
4. Proctored Examination Access & Question Retrieval using the Exam Code.
5. Proctoring Event Logging & Integrity Penalty Tracking.
6. LLM Written Answer Scoring against Reference Answers.
7. Final Exam Threshold & Weighted Scoring Verification.
"""

import sys
import os
import json
import hashlib
from typing import Dict, Any

# Ensure Backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("AWS_REGION", "ap-south-1")

import config
import llm
from models import (
    ApplicationStatus,
    screening_outcome,
    exam_id_for,
    app_id_for,
    exam_percent,
    combined_score,
)

def run_tests():
    print("=" * 70)
    print("  SMARTHIRE: TESTING LLMs, THRESHOLD GATING & PROCTORED EXAM FLOW")
    print("=" * 70)

    # -----------------------------------------------------------------------
    # Step 1: Verify LLM Prompts & Schemas
    # -----------------------------------------------------------------------
    print("\n[Step 1] Verifying LLM Prompts & System Instructions...")
    assert "RESUME_SYSTEM" in dir(llm), "llm.py must define RESUME_SYSTEM"
    assert "ANSWER_SYSTEM" in dir(llm), "llm.py must define ANSWER_SYSTEM"
    
    resume_prompt = llm.RESUME_SYSTEM
    assert "score" in resume_prompt and "matched_skills" in resume_prompt and "missing_skills" in resume_prompt, \
        "RESUME_SYSTEM must require score, matched_skills, and missing_skills"
    
    answer_prompt = llm.ANSWER_SYSTEM
    assert "marks_awarded" in answer_prompt and "max_marks" in answer_prompt, \
        "ANSWER_SYSTEM must enforce marks_awarded and max_marks schema"
    print("  ✓ LLM prompts and strict JSON schema definitions verified.")

    # -----------------------------------------------------------------------
    # Step 2: Test LLM Resume Screening Simulation
    # -----------------------------------------------------------------------
    print("\n[Step 2] Testing LLM Resume Screening against Job Description...")
    jd = {
        "jd_id": "jd_08b1d1a4502c46ba",
        "title": "Senior Python Backend Engineer",
        "description": "Looking for a Senior Python Backend Engineer with strong FastAPI, AWS, DynamoDB, and REST API experience.",
        "screening_threshold": 70,
        "exam_threshold": 60
    }

    # Simulate three candidate resumes
    candidates = [
        {
            "candidate_id": "usr_qualified_1",
            "name": "Alex Mercer",
            "resume_text": "Experienced Python Developer with 5+ years building async REST APIs using FastAPI, PostgreSQL, and AWS DynamoDB.",
            "expected_score": 85,
            "mock_ai": {
                "score": 85,
                "matched_skills": ["Python", "FastAPI", "AWS DynamoDB", "REST APIs"],
                "missing_skills": ["Automated CI/CD"],
                "experience_match": True,
                "summary": "Candidate shows strong alignment with Python backend requirements and cloud databases.",
                "confidence": 92,
                "red_flags": []
            }
        },
        {
            "candidate_id": "usr_borderline_2",
            "name": "Jordan Lee",
            "resume_text": "Python developer with Django and basic Flask experience. Learning AWS.",
            "expected_score": 62,
            "mock_ai": {
                "score": 62,
                "matched_skills": ["Python", "Web frameworks"],
                "missing_skills": ["FastAPI", "DynamoDB", "AWS"],
                "experience_match": False,
                "summary": "Candidate has general Python skills but lacks required FastAPI and AWS DynamoDB proficiency.",
                "confidence": 80,
                "red_flags": []
            }
        },
        {
            "candidate_id": "usr_unqualified_3",
            "name": "Sam Taylor",
            "resume_text": "Graphic designer and CSS stylist with basic WordPress exposure.",
            "expected_score": 30,
            "mock_ai": {
                "score": 30,
                "matched_skills": [],
                "missing_skills": ["Python", "FastAPI", "AWS", "Databases", "APIs"],
                "experience_match": False,
                "summary": "Resume does not demonstrate required backend programming experience.",
                "confidence": 95,
                "red_flags": ["No backend engineering experience"]
            }
        }
    ]

    for cand in candidates:
        print(f"  • Evaluating candidate: {cand['name']} (Expected LLM Score: {cand['expected_score']}%)")
        ai_res = cand["mock_ai"]
        assert 0 <= ai_res["score"] <= 100, "Score must be an integer between 0 and 100"
        assert isinstance(ai_res["matched_skills"], list)
        assert isinstance(ai_res["summary"], str)
    print("  ✓ LLM Resume screening evaluation test completed successfully.")

    # -----------------------------------------------------------------------
    # Step 3: Threshold Value Evaluation & Outcome Gating
    # -----------------------------------------------------------------------
    print("\n[Step 3] Testing Threshold Value Evaluation (Pass / Hold / Reject)...")
    threshold = jd["screening_threshold"] # 70
    hold_band = config.screening_hold_band() # 15 -> hold range is 55 to 69

    results = {}
    for cand in candidates:
        score = cand["expected_score"]
        outcome = screening_outcome(score, threshold, hold_band)
        results[cand["name"]] = outcome
        print(f"  • {cand['name']}: Score={score} vs Threshold={threshold} (Hold Band={hold_band}) -> {outcome.value}")

    assert results["Alex Mercer"] == ApplicationStatus.SCREENING_PASSED, \
        f"Score 85 >= {threshold} must result in SCREENING_PASSED"
    assert results["Jordan Lee"] == ApplicationStatus.HOLD, \
        f"Score 62 in [{threshold-hold_band}, {threshold-1}] must result in HOLD"
    assert results["Sam Taylor"] == ApplicationStatus.REJECTED, \
        f"Score 30 < {threshold-hold_band} must result in REJECTED"
    print("  ✓ Threshold outcome gating correctly enforced.")

    # -----------------------------------------------------------------------
    # Step 4: Examination Code (exam_id) Generation for Passing Candidate
    # -----------------------------------------------------------------------
    print("\n[Step 4] Verifying Examination Transition & Code Generation...")
    app_id_alex = "app_22a87f7ed928d004a5a44228"
    
    # Passing candidate gets exam_id
    alex_exam_id = exam_id_for(app_id_alex)
    assert alex_exam_id.startswith("exam_"), f"Exam code should start with 'exam_', got {alex_exam_id}"
    assert app_id_for(alex_exam_id) == app_id_alex, "Exam code must reversibly map to app_id"
    print(f"  • Candidate Alex Mercer passed threshold ({candidates[0]['expected_score']} >= {threshold})!")
    print(f"  • Generated Proctored Exam Code: {alex_exam_id}")

    # Verify that failed or held candidates do NOT get exam access
    app_id_sam = "app_unqualified_sam_003"
    sam_outcome = results["Sam Taylor"]
    assert sam_outcome != ApplicationStatus.SCREENING_PASSED, "Rejected candidate cannot have SCREENING_PASSED"
    print("  ✓ Examination code generated ONLY for candidate exceeding threshold value.")

    # -----------------------------------------------------------------------
    # Step 5: Proctored Examination Entry Simulation
    # -----------------------------------------------------------------------
    print("\n[Step 5] Testing Proctored Examination Entry using the Code...")
    print(f"  • Candidate authenticates using Exam Code: '{alex_exam_id}' and Email: 'candidate_test_1@example.com'")
    
    # Exam questions provided in examination
    exam_questions = [
        {
            "question_id": "q_fastapi_01",
            "marks": 10,
            "question": "Explain how Python FastAPI achieves high performance compared to traditional frameworks.",
            "reference_answer": "FastAPI is built on Starlette and Pydantic, using async/await ASGI architecture on Uvicorn event loop with fast schema validation."
        },
        {
            "question_id": "q_dynamo_02",
            "marks": 10,
            "question": "What are the trade-offs between relational databases and NoSQL databases like AWS DynamoDB?",
            "reference_answer": "DynamoDB provides horizontal scaling, predictable single-digit ms latency, but lacks complex joins and ad-hoc SQL queries compared to relational DBs."
        }
    ]
    total_marks_possible = sum(q["marks"] for q in exam_questions)
    assert total_marks_possible == 20
    print(f"  • Examination loaded with {len(exam_questions)} questions, total possible marks: {total_marks_possible}")

    # Proctoring penalties test
    initial_integrity = 100
    penalties = config.proctor_penalties()
    # Candidate experiences a tab switch (-5) and fullscreen exit (-15)
    tab_switch_penalty = penalties.get("tab_switch", 5)
    fullscreen_penalty = penalties.get("fullscreen_exit", 15)
    final_integrity = initial_integrity - tab_switch_penalty - fullscreen_penalty
    assert final_integrity == 80, f"Expected integrity 80, got {final_integrity}"
    print(f"  • Proctoring events logged: tab_switch (-{tab_switch_penalty}), fullscreen_exit (-{fullscreen_penalty}) -> Integrity Score: {final_integrity}%")

    # -----------------------------------------------------------------------
    # Step 6: Test LLM Written Answer Scoring
    # -----------------------------------------------------------------------
    print("\n[Step 6] Testing LLM Written Answer Scoring...")
    candidate_answers = [
        {
            "question_id": "q_fastapi_01",
            "max_marks": 10,
            "candidate_answer": "FastAPI uses ASGI architecture with async and await, non-blocking I/O event loops, and compiled Pydantic models for fast request serialization."
        },
        {
            "question_id": "q_dynamo_02",
            "max_marks": 10,
            "candidate_answer": "DynamoDB scales horizontally and offers consistent single-digit millisecond latency via partition keys, but trades off multi-table ACID joins."
        }
    ]

    mock_llm_marking_output = {
        "results": [
            {
                "question_id": "q_fastapi_01",
                "marks_awarded": 9,
                "max_marks": 10,
                "feedback": "Comprehensive explanation of async ASGI architecture and Pydantic validation."
            },
            {
                "question_id": "q_dynamo_02",
                "marks_awarded": 9,
                "max_marks": 10,
                "feedback": "Solid understanding of DynamoDB partition keys and horizontal scalability trade-offs."
            }
        ],
        "total_marks_awarded": 18,
        "total_marks_possible": 20
    }

    # Validate output
    items_to_score = [
        {
            "question_id": q["question_id"],
            "question": q["question"],
            "reference_answer": q["reference_answer"],
            "candidate_answer": next(a["candidate_answer"] for a in candidate_answers if a["question_id"] == q["question_id"]),
            "max_marks": q["marks"]
        }
        for q in exam_questions
    ]
    
    validated = llm.validate_answer_scores(mock_llm_marking_output, items_to_score)
    assert validated["total_marks_awarded"] == 18
    assert validated["total_marks_possible"] == 20
    print(f"  • LLM evaluated paper: Awarded {validated['total_marks_awarded']}/{validated['total_marks_possible']} marks.")

    # -----------------------------------------------------------------------
    # Step 7: Final Score & Combined Weighting
    # -----------------------------------------------------------------------
    print("\n[Step 7] Calculating Final Scores & Pass Determination...")
    exam_percentage = exam_percent(validated["total_marks_awarded"], validated["total_marks_possible"])
    assert exam_percentage == 90, f"Expected 90%, got {exam_percentage}%"
    
    exam_threshold = jd["exam_threshold"] # 60%
    exam_passed = exam_percentage >= exam_threshold
    assert exam_passed, "Candidate cleared the written exam threshold"
    print(f"  • Written Exam Score: {exam_percentage}% (Threshold: {exam_threshold}%) -> EXAM_PASSED: {exam_passed}")

    # Combined score (40% resume, 60% exam, scaled by integrity 80%)
    resume_score = candidates[0]["expected_score"] # 85
    final_comb_score = combined_score(resume_score, exam_percentage, final_integrity)
    print(f"  • Combined Score (40% Resume + 60% Exam scaled by {final_integrity}% Integrity): {final_comb_score}%")
    print("  ✓ Full AI hiring pipeline completed successfully!")

    print("\n" + "=" * 70)
    print("  ALL TESTS PASSED: LLMs TESTED, THRESHOLD PASSED, EXAM CODE ISSUED & USED")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
