/**
 * test_full_e2e.js
 * Comprehensive End-to-End Simulation Test:
 * 1. Admin signup & login
 * 2. Admin creates an interviewer
 * 3. Admin creates a job, assigns the new interviewer, adds custom questions with reference answers, and publishes it
 * 4. Candidate signup & login (verifying no fetch failed)
 * 5. Candidate profile & resume verification
 * 6. Candidate applies for the job -> keyword-based screening against JD
 * 7. Candidate enters proctored exam -> receives exact custom questions
 * 8. Candidate submits answers -> graded against reference criteria
 * 9. Exam results verification
 * 10. Interviewer reviews application & records decision
 * 11. Final offer / acceptance verification
 */

const assert = require('assert');
const { Readable } = require('stream');
const { server } = require('./local_proxy.js');

async function handleRequest(pathname, method = 'GET', query = {}, body = null, headers = {}) {
  return new Promise((resolve) => {
    let qStr = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    if (qStr) qStr = '?' + qStr;

    const bodyBuffer = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : Buffer.alloc(0);

    const req = new Readable({
      read() {
        if (bodyBuffer.length > 0) {
          this.push(bodyBuffer);
        }
        this.push(null);
      }
    });

    req.method = method;
    req.url = '/' + pathname + qStr;
    req.headers = {
      'content-type': 'application/json',
      ...headers
    };

    let responseData = null;
    let responseStatus = 200;

    const res = {
      setHeader: () => {},
      writeHead: (code) => { responseStatus = code; },
      end: (data) => {
        try {
          responseData = JSON.parse(data.toString('utf8'));
        } catch {
          responseData = data ? data.toString('utf8') : null;
        }
        resolve({ status: responseStatus, data: responseData });
      }
    };

    server.emit('request', req, res);
  });
}

async function runTest() {
  console.log("==========================================================");
  console.log(">>> SMART HIRE FULL END-TO-END VERIFICATION TEST <<<");
  console.log("==========================================================\n");

  // -------------------------------------------------------------------------
  // 1. Admin Signup
  // -------------------------------------------------------------------------
  console.log("1. Testing Admin Signup (/auth/signup/admin)...");
  const adminSignup = await handleRequest('auth/signup/admin', 'GET', {
    organization_name: "BNP Paribas Global Tech",
    name: "Alex Vance",
    email: "alex.admin@bnp.com",
    password: "Password123!"
  }, null, { referer: "http://localhost:5173/signup" });

  console.log("Admin Signup Response:", adminSignup.data);
  assert.strictEqual(adminSignup.data?.success, true);
  assert.strictEqual(adminSignup.data?.data?.role, "admin");
  assert.strictEqual(adminSignup.data?.data?.name, "Alex Vance");
  console.log("✓ Admin signup passed!\n");

  // -------------------------------------------------------------------------
  // 2. Admin Login
  // -------------------------------------------------------------------------
  console.log("2. Testing Admin Login (/auth/login)...");
  const adminLogin = await handleRequest('auth/login', 'GET', {
    email: "alex.admin@bnp.com",
    password: "Password123!"
  }, null, { referer: "http://localhost:5173/login" });

  assert.strictEqual(adminLogin.data?.success, true);
  assert.strictEqual(adminLogin.data?.data?.role, "admin");
  console.log("✓ Admin login passed!\n");

  // -------------------------------------------------------------------------
  // 3. Admin Creates an Interviewer
  // -------------------------------------------------------------------------
  console.log("3. Testing Admin Creates Interviewer (/admin/interviewers/create)...");
  const createInt = await handleRequest('admin/interviewers/create', 'POST', {}, {
    name: "Dr. Sarah Jenkins",
    email: "sarah.jenkins@bnp.com",
    password: "Password123!"
  });

  console.log("Created Interviewer:", createInt.data?.data);
  assert.strictEqual(createInt.data?.success, true);
  const interviewerId = createInt.data?.data?.user_id || createInt.data?.data?.id;
  assert(interviewerId, "Interviewer ID must be returned");
  console.log("✓ Interviewer created with ID:", interviewerId, "\n");

  // -------------------------------------------------------------------------
  // 4. Admin Creates a Job & Assigns the Interviewer
  // -------------------------------------------------------------------------
  console.log("4. Testing Admin Creates Job Draft (/admin/jds/create)...");
  const createJob = await handleRequest('admin/jds/create', 'POST', {}, {
    title: "Senior Distributed Cloud Engineer",
    description: "Seeking a Senior Cloud Engineer to build asynchronous microservices using Python, FastAPI, AWS DynamoDB, Docker, and Kubernetes. Automated testing and Linux skills required.",
    interviewer_id: interviewerId,
    screening_threshold: "70",
    exam_threshold: "60",
    expiry: "2026-12-31T23:59:59Z"
  });

  const jdId = createJob.data?.data?.jd_id || createJob.data?.data?.job_id;
  console.log("Created Job Draft ID:", jdId);
  assert(jdId, "Job ID must be returned");
  assert.strictEqual(createJob.data?.data?.interviewer_name, "Dr. Sarah Jenkins");
  console.log("✓ Job draft created and assigned to Dr. Sarah Jenkins!\n");

  // -------------------------------------------------------------------------
  // 5. Admin Adds Custom Questions & Reference Answers
  // -------------------------------------------------------------------------
  console.log("5. Testing Admin Adds Custom Questions (/admin/jds/:id/questions/create)...");
  const q1 = await handleRequest(`admin/jds/${jdId}/questions/create`, 'POST', {}, {
    question: "Explain how Python FastAPI achieves high concurrency using ASGI event loops and coroutines.",
    reference_answer: "FastAPI runs on the Starlette ASGI toolkit with Uvicorn uvloop, executing async/await coroutines on a single-threaded non-blocking event loop while handling synchronous routes in an external thread pool.",
    marks: "10"
  });
  console.log("Q1 Added:", q1.data?.data?.question_id, "| Marks:", q1.data?.data?.marks);

  const q2 = await handleRequest(`admin/jds/${jdId}/questions/create`, 'POST', {}, {
    question: "Describe your strategy for zero-downtime blue-green deployments on AWS EKS with Kubernetes.",
    reference_answer: "Deploy duplicate blue and green target groups with Route 53 weighted records or ALB listener rule modifications, testing the new release before cutting traffic over with immediate rollback capability.",
    marks: "10"
  });
  console.log("Q2 Added:", q2.data?.data?.question_id, "| Marks:", q2.data?.data?.marks);
  console.log("✓ Custom questions with reference answers added!\n");

  // -------------------------------------------------------------------------
  // 6. Admin Publishes the Job
  // -------------------------------------------------------------------------
  console.log("6. Testing Admin Publishes Job (/admin/jds/:id/publish)...");
  const pubRes = await handleRequest(`admin/jds/${jdId}/publish`, 'POST');
  assert.strictEqual(pubRes.data?.data?.status, "LIVE");
  console.log("✓ Job is LIVE and open for applicants!\n");

  // -------------------------------------------------------------------------
  // 7. Candidate Signup (Verifying No Fetch Failed)
  // -------------------------------------------------------------------------
  console.log("7. Testing Candidate Signup (/auth/signup/candidate)...");
  const candSignup = await handleRequest('auth/signup/candidate', 'GET', {
    name: "Vikram Sharma",
    email: "vikram.sharma@example.com",
    password: "CandidatePassword123!"
  }, null, { referer: "http://localhost:5174/signup" });

  console.log("Candidate Signup Response:", candSignup.data);
  assert.strictEqual(candSignup.data?.success, true);
  assert.strictEqual(candSignup.data?.data?.role, "candidate");
  assert.strictEqual(candSignup.data?.data?.name, "Vikram Sharma");
  console.log("✓ Candidate signup works seamlessly with zero fetch errors!\n");

  // -------------------------------------------------------------------------
  // 8. Candidate Login
  // -------------------------------------------------------------------------
  console.log("8. Testing Candidate Login (/auth/login)...");
  const candLogin = await handleRequest('auth/login', 'GET', {
    email: "vikram.sharma@example.com",
    password: "CandidatePassword123!"
  }, null, { referer: "http://localhost:5174/login" });

  assert.strictEqual(candLogin.data?.success, true);
  assert.strictEqual(candLogin.data?.data?.role, "candidate");
  console.log("✓ Candidate login passed!\n");

  // -------------------------------------------------------------------------
  // 9. Candidate Profile & Resume
  // -------------------------------------------------------------------------
  console.log("9. Testing Candidate Profile (/candidate/me)...");
  const profileRes = await handleRequest('candidate/me');
  assert.strictEqual(profileRes.data?.data?.email, "vikram.sharma@example.com");
  console.log("✓ Candidate profile retrieved!\n");

  // -------------------------------------------------------------------------
  // 10. Candidate Applies -> Keyword-Based Screening Against JD
  // -------------------------------------------------------------------------
  console.log("10. Testing Candidate Applies (/candidate/apply/:jd_id)...");
  const applyRes = await handleRequest(`candidate/apply/${jdId}`, 'POST');
  const appData = applyRes.data?.data;
  console.log("Application ID:", appData?.app_id);
  console.log("Screening Status:", appData?.status);
  console.log("Screening Score:", appData?.screening?.score + "%", "(Threshold:", appData?.screening?.threshold + "%)");
  console.log("Matched Skills:", appData?.screening?.matched_skills);
  console.log("Missing Skills:", appData?.screening?.missing_skills);

  assert(appData?.screening?.score >= 70, "Python & Cloud candidate should score >= 70%");
  assert.strictEqual(appData?.status, "SCREENING_PASSED");
  assert.strictEqual(appData?.exam?.eligible, true);
  const examId = appData?.exam_id;
  assert(examId, "Exam ID must be generated for screening-passed candidate");
  console.log("✓ Candidate cleared AI keyword screening against JD criteria!\n");

  // -------------------------------------------------------------------------
  // 11. Proctored Exam Start (Verifying Custom Questions)
  // -------------------------------------------------------------------------
  console.log("11. Testing Exam Start (/exam/:id/start)...");
  const examStart = await handleRequest(`exam/${examId}/start`);
  const receivedQuestions = examStart.data?.data?.questions;
  console.log("Exam Total Marks:", examStart.data?.data?.total_marks);
  console.log(`Received ${receivedQuestions?.length} Questions:`);
  receivedQuestions?.forEach((q, i) => {
    console.log(`  [Q${i+1}] ${q.question_id}: ${q.question} (${q.marks} marks)`);
  });

  assert.strictEqual(receivedQuestions?.length, 2, "Exam must have exactly the 2 custom questions");
  assert(receivedQuestions[0].question.includes("FastAPI"), "Q1 must be the custom FastAPI question");
  assert(receivedQuestions[1].question.includes("blue-green"), "Q2 must be the custom Blue-Green question");
  console.log("✓ Proctored Exam displays the exact custom questions created by the admin!\n");

  // -------------------------------------------------------------------------
  // 12. Candidate Submits Answers -> Graded Against Reference Answers
  // -------------------------------------------------------------------------
  console.log("12. Testing Exam Submission (/exam/:id/submit)...");
  const submitRes = await handleRequest(`exam/${examId}/submit`, 'POST', {}, {
    answers: [
      {
        question_id: receivedQuestions[0].question_id,
        answer: "FastAPI is built on the Starlette ASGI framework and Uvicorn uvloop. It uses async/await coroutines to handle I/O concurrently on an event loop without blocking execution, while handling synchronous calls in a background threadpool."
      },
      {
        question_id: receivedQuestions[1].question_id,
        answer: "For blue-green deployments on AWS EKS, we run two identical environments. An ALB with listener rules or Route 53 weighted routing directs traffic from blue to green once automated sanity checks pass, allowing instantaneous zero-downtime cutover and easy rollback."
      }
    ]
  });

  console.log("Submission Status:", submitRes.data?.data?.status);
  console.log("Marks Awarded:", submitRes.data?.data?.marks_awarded, "/", submitRes.data?.data?.marks_possible);
  console.log("Score Percentage:", submitRes.data?.data?.score_percent + "%");
  assert(submitRes.data?.data?.score_percent >= 70, "Strong candidate answer should score >= 70%");
  assert.strictEqual(submitRes.data?.data?.status, "EXAM_PASSED");
  console.log("✓ Answers graded dynamically against custom reference answers and passed!\n");

  // -------------------------------------------------------------------------
  // 13. Interviewer Reviews Candidate Application & Evaluated Answers
  // -------------------------------------------------------------------------
  console.log("13. Testing Interviewer Portal (/interviewer/applications/:id)...");
  const interviewerReview = await handleRequest(`interviewer/applications/${appData.app_id}`);
  const intData = interviewerReview.data?.data;
  console.log("Interviewer Application Status:", intData?.application?.status);
  console.log("Candidate Name:", intData?.candidate?.name);
  console.log("Exam Score:", intData?.application?.exam_score + "%");
  console.log("Interviewer Evaluated Answers:");
  intData?.exam?.answers?.forEach((a, i) => {
    console.log(`  [Q${i+1}] Marks: ${a.marks_awarded}/${a.max_marks}`);
    console.log(`       Question: ${a.question}`);
    console.log(`       Reference: ${a.reference_answer}`);
    console.log(`       Candidate: ${a.candidate_answer}`);
    console.log(`       Feedback: ${a.ai_feedback}`);
  });

  assert.strictEqual(intData?.application?.status, "INTERVIEW_PENDING");
  assert.strictEqual(intData?.exam?.answers?.length, 2);
  console.log("✓ Interviewer sees full candidate evaluation with custom questions and reference answers!\n");

  // -------------------------------------------------------------------------
  // 14. Interviewer Records Decision (Accept)
  // -------------------------------------------------------------------------
  console.log("14. Testing Interviewer Decision (/interviewer/applications/:id/decision)...");
  const decisionRes = await handleRequest(`interviewer/applications/${appData.app_id}/decision`, 'POST', {}, {
    decision: "ACCEPTED",
    note: "Candidate performed exceptionally well in the proctored exam and demonstrated deep knowledge of FastAPI and Kubernetes."
  });
  assert.strictEqual(decisionRes.data?.data?.decision, "ACCEPTED");
  console.log("✓ Interviewer accepted candidate for offer!\n");

  // -------------------------------------------------------------------------
  // 15. Candidate Application Final State
  // -------------------------------------------------------------------------
  console.log("15. Testing Candidate Application View (/candidate/me/applications/:id)...");
  const finalAppRes = await handleRequest(`candidate/me/applications/${appData.app_id}`);
  console.log("Final Candidate Application Status:", finalAppRes.data?.data?.status);
  assert.strictEqual(finalAppRes.data?.data?.status, "ACCEPTED");
  assert.strictEqual(finalAppRes.data?.data?.next_action, "OFFER_EXTENDED");
  console.log("✓ Final candidate status is ACCEPTED (Offer Extended)!\n");

  console.log("==========================================================");
  console.log(">>> ALL 15 END-TO-END WORKFLOW TESTS PASSED 100%! <<<");
  console.log("==========================================================");
}

runTest().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
