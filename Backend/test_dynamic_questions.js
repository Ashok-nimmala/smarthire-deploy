/**
 * test_dynamic_questions.js
 * End-to-end test verifying that custom questions added during job creation
 * appear in the proctored exam and their answers are graded against the reference answers.
 */

const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log("=== STEP 1: Admin Creates Job ===");
  const jobPayload = {
    title: "Lead Payment Systems Architect",
    description: "Architecting high-scale fault-tolerant payment systems.",
    interviewer_id: "usr_interviewer_1",
    screening_threshold: "75",
    exam_threshold: "60",
    expiry: "2026-12-31T23:59:59Z"
  };

  const createRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: '/admin/jds/create',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, jobPayload);

  console.log("Job Create Status:", createRes.status);
  console.log("Job ID created:", createRes.data?.data?.jd_id);
  const jdId = createRes.data?.data?.jd_id;
  if (!jdId) throw new Error("Failed to create job");

  console.log("\n=== STEP 2: Admin Adds Question 1 ===");
  const q1Payload = {
    question: "Explain how ACID transactions and optimistic locking are implemented in PostgreSQL.",
    reference_answer: "ACID transactions use Write-Ahead Logging (WAL) and Multi-Version Concurrency Control (MVCC) where row versions (xmin, xmax) prevent dirty reads. Optimistic locking uses a version column checked in UPDATE WHERE clauses.",
    marks: "10"
  };
  const q1Res = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/admin/jds/${jdId}/questions/create`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, q1Payload);
  console.log("Q1 added:", q1Res.data?.data?.question_id, "Marks:", q1Res.data?.data?.marks);

  console.log("\n=== STEP 3: Admin Adds Question 2 ===");
  const q2Payload = {
    question: "Describe how you design an idempotent payment processing REST API to prevent duplicate charges.",
    reference_answer: "Use unique Idempotency-Key header stored in Redis/DB with atomic transaction status (processing, succeeded, failed) and distributed locks to deduplicate requests.",
    marks: "15"
  };
  const q2Res = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/admin/jds/${jdId}/questions/create`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, q2Payload);
  console.log("Q2 added:", q2Res.data?.data?.question_id, "Marks:", q2Res.data?.data?.marks);

  console.log("\n=== STEP 4: Admin Publishes Job ===");
  const pubRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/admin/jds/${jdId}/publish`,
    method: 'POST'
  });
  console.log("Job Published:", pubRes.data?.data?.status);

  console.log("\n=== STEP 5: Candidate Applies to Job ===");
  const applyRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/candidate/apply/${jdId}`,
    method: 'POST'
  });
  console.log("Application ID:", applyRes.data?.data?.app_id);
  console.log("Exam ID:", applyRes.data?.data?.exam_id);
  const examId = applyRes.data?.data?.exam_id;
  const appId = applyRes.data?.data?.app_id;

  console.log("\n=== STEP 6: Candidate Starts Exam ===");
  const startRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/exam/${examId}/start`,
    method: 'GET'
  });
  console.log("Exam Start Response Questions Count:", startRes.data?.data?.questions?.length);
  console.log("Exam Total Marks:", startRes.data?.data?.total_marks);
  console.log("Exam Questions Received:");
  startRes.data?.data?.questions?.forEach((q, i) => {
    console.log(`  [Q${i+1}] ID: ${q.question_id} | Marks: ${q.marks}`);
    console.log(`       Text: ${q.question}`);
  });

  const receivedQ1 = startRes.data?.data?.questions?.[0];
  const receivedQ2 = startRes.data?.data?.questions?.[1];

  if (!receivedQ1 || !receivedQ1.question.includes("ACID transactions")) {
    throw new Error("Question 1 does NOT match custom question added by admin!");
  }
  if (!receivedQ2 || !receivedQ2.question.includes("idempotent payment")) {
    throw new Error("Question 2 does NOT match custom question added by admin!");
  }
  console.log(">>> SUCCESS: Exact custom questions are present in Proctored Exam!");

  console.log("\n=== STEP 7: Candidate Submits Exam Answers ===");
  console.log("Answer 1: A fairy tale story (should get 0 marks)");
  console.log("Answer 2: Strong technical answer matching reference criteria (should get high marks)");

  const submitPayload = {
    answers: [
      {
        question_id: receivedQ1.question_id,
        answer: "Once upon a time in a magic kingdom, a young princess went to the park and had strawberry ice cream with her dragon friend."
      },
      {
        question_id: receivedQ2.question_id,
        answer: "To implement idempotent payment processing, clients provide an Idempotency-Key header. We store this in Redis with distributed locking and track atomic transaction states (processing, succeeded, failed) to prevent duplicate charges."
      }
    ]
  };

  const submitRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/exam/${examId}/submit`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, submitPayload);

  console.log("Submit Status:", submitRes.status);
  console.log("Evaluation Result:", submitRes.data?.data);

  console.log("\n=== STEP 8: Check Exam Results ===");
  const resultRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/exam/${examId}/result`,
    method: 'GET'
  });
  console.log("Score Percent:", resultRes.data?.data?.score_percent + "%");
  console.log("Marks Awarded:", resultRes.data?.data?.marks_awarded, "/", resultRes.data?.data?.marks_possible);
  console.log("Evaluated Question Details:");
  resultRes.data?.data?.results?.forEach((r, i) => {
    console.log(`  [Q${i+1}] Marks: ${r.marks_awarded}/${r.max_marks}`);
    console.log(`       Question: ${r.question}`);
    console.log(`       Reference: ${r.reference_answer}`);
    console.log(`       Feedback: ${r.ai_feedback}`);
  });

  const evalQ1 = resultRes.data?.data?.results?.[0];
  const evalQ2 = resultRes.data?.data?.results?.[1];

  if (evalQ1.marks_awarded !== 0) {
    throw new Error(`Expected Question 1 (story) to receive 0 marks, but got ${evalQ1.marks_awarded}!`);
  }
  if (evalQ2.marks_awarded < 10) {
    throw new Error(`Expected Question 2 to receive high marks, but got ${evalQ2.marks_awarded}!`);
  }

  console.log("\n=== STEP 9: Interviewer Application View ===");
  const intRes = await request({
    hostname: 'localhost',
    port: 8000,
    path: `/interviewer/applications/${appId}`,
    method: 'GET'
  });
  console.log("Interviewer Application Status:", intRes.data?.data?.application?.status);
  console.log("Interviewer Questions Total:", intRes.data?.data?.exam?.questions_total);
  console.log("Interviewer Exam Score:", intRes.data?.data?.exam?.score_percent);

  console.log("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

