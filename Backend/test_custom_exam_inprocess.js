/**
 * test_custom_exam_inprocess.js
 * In-process integration test testing the local_proxy request listener directly
 * without needing network/socket bindings.
 */

const assert = require('assert');
const { Readable } = require('stream');
const { server } = require('./local_proxy.js');

// Helper to simulate an HTTP request to the server request listener
function invokeServer(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = new Readable();
    req.method = method;
    req.url = url;
    req.headers = {
      host: 'localhost:8000',
      accept: 'application/json',
      ...headers
    };

    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = Buffer.byteLength(payload);
      req.push(payload);
    }
    req.push(null); // End stream

    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];

    const res = {
      writeHead: (status, h = {}) => {
        statusCode = status;
        Object.assign(resHeaders, h);
      },
      setHeader: (k, v) => {
        resHeaders[k.toLowerCase()] = v;
      },
      write: (chunk) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end: (chunk) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const resBody = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: statusCode, headers: resHeaders, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: statusCode, headers: resHeaders, raw: resBody });
        }
      }
    };

    // Dispatch to server request listeners
    const listeners = server.listeners('request');
    if (listeners.length === 0) {
      reject(new Error("No request listeners registered on server"));
      return;
    }
    listeners[0](req, res);
  });
}

async function runTests() {
  console.log("================================================================================");
  console.log("STARTING IN-PROCESS END-TO-END VERIFICATION OF CUSTOM EXAM QUESTIONS");
  console.log("================================================================================\n");

  // Step 1: Admin Creates Job Draft
  console.log("--- 1. Admin Creates Job Draft ---");
  const createRes = await invokeServer('POST', '/admin/jds/create', {
    title: "Senior Full Stack Distributed Systems Architect",
    description: "Design high performance distributed architectures using microservices and event driven design.",
    interviewer_id: "usr_interviewer_1",
    screening_threshold: 70,
    exam_threshold: 60,
    expiry: "2026-12-31T23:59:59Z"
  });
  assert.strictEqual(createRes.status, 200);
  assert(createRes.data.success, "Job draft should succeed");
  const jdId = createRes.data.data.jd_id;
  console.log("✓ Created Job ID:", jdId);

  // Step 2: Admin Adds Custom Question 1
  console.log("\n--- 2. Admin Adds Custom Question 1 ---");
  const q1Text = "Custom Q1: Explain how Raft consensus algorithm prevents split-brain scenarios and ensures leader election safety.";
  const q1Ref = "Raft requires a majority quorum (N/2 + 1) for electing a leader and committing log entries. In a network partition, only the partition with a majority can elect a leader, preventing two leaders from committing conflicting logs.";
  const q1Res = await invokeServer('POST', `/admin/jds/${jdId}/questions/create`, {
    question: q1Text,
    reference_answer: q1Ref,
    marks: "10"
  });
  assert.strictEqual(q1Res.status, 200);
  assert(q1Res.data.success);
  const q1Id = q1Res.data.data.question_id;
  console.log("✓ Added Custom Question 1:", q1Id);

  // Step 3: Admin Adds Custom Question 2
  console.log("\n--- 3. Admin Adds Custom Question 2 ---");
  const q2Text = "Custom Q2: Compare optimistic vs pessimistic concurrency control in distributed databases with high write contention.";
  const q2Ref = "Optimistic concurrency uses record versioning or timestamps validating on commit, best for low contention. Pessimistic concurrency uses explicit row or range locks before updates, preventing conflicts at the cost of reduced throughput.";
  const q2Res = await invokeServer('POST', `/admin/jds/${jdId}/questions/create`, {
    question: q2Text,
    reference_answer: q2Ref,
    marks: "10"
  });
  assert.strictEqual(q2Res.status, 200);
  assert(q2Res.data.success);
  const q2Id = q2Res.data.data.question_id;
  console.log("✓ Added Custom Question 2:", q2Id);

  // Step 4: Admin Publishes Job
  console.log("\n--- 4. Admin Publishes Job ---");
  const pubRes = await invokeServer('POST', `/admin/jds/${jdId}/publish`);
  assert.strictEqual(pubRes.status, 200);
  assert.strictEqual(pubRes.data.data.status, "LIVE");
  console.log("✓ Job successfully published as LIVE");

  // Step 5: Check Public Job Details returns custom question count
  console.log("\n--- 5. Verify Public Job Details ---");
  const pubJobRes = await invokeServer('GET', `/public/jobs/${jdId}`);
  assert.strictEqual(pubJobRes.status, 200);
  assert.strictEqual(pubJobRes.data.data.question_count, 2, "Job should have 2 questions");
  assert.strictEqual(pubJobRes.data.data.total_marks, 20, "Total marks should be 20");
  console.log("✓ Public job details accurately reflect 2 custom questions and 20 marks");

  // Step 6: Candidate Signs Up & Applies
  console.log("\n--- 6. Candidate Signs Up & Applies ---");
  const signupRes = await invokeServer('POST', '/auth/signup/candidate', {
    name: "Alex Dev",
    email: "alex_dev_custom@example.com",
    password: "Password123!"
  });
  assert.strictEqual(signupRes.status, 200);
  const candToken = signupRes.data.data.session_token;

  const applyRes = await invokeServer('POST', `/candidate/apply/${jdId}`, {}, {
    authorization: `Bearer ${candToken}`
  });
  assert.strictEqual(applyRes.status, 200);
  assert(applyRes.data.data.screening.passed, "Screening should pass");
  const appId = applyRes.data.data.app_id;
  const examId = applyRes.data.data.exam_id;
  console.log("✓ Candidate applied successfully. Application ID:", appId, "| Exam ID:", examId);

  // Step 7: Proctored Exam Overview (/exam/:id)
  console.log("\n--- 7. Proctored Exam Info (/exam/:id) ---");
  const examInfoRes = await invokeServer('GET', `/exam/${examId}`);
  assert.strictEqual(examInfoRes.status, 200);
  assert.strictEqual(examInfoRes.data.data.question_count, 2);
  assert.strictEqual(examInfoRes.data.data.total_marks, 20);
  console.log("✓ Proctored Exam Info reports 2 questions and 20 marks");

  // Step 8: Proctored Exam Start (/exam/:id/start) - CRITICAL CHECK!
  console.log("\n--- 8. Proctored Exam Start (/exam/:id/start) - VERIFY CUSTOM QUESTIONS ---");
  const examStartRes = await invokeServer('GET', `/exam/${examId}/start`);
  assert.strictEqual(examStartRes.status, 200);
  const receivedQuestions = examStartRes.data.data.questions;
  console.log(`Received ${receivedQuestions.length} questions from proctored exam:`);
  receivedQuestions.forEach((q, i) => {
    console.log(`  [Q${i+1}] ID: ${q.question_id} (${q.marks} marks): "${q.question}"`);
  });

  assert.strictEqual(receivedQuestions.length, 2, "Should return exactly 2 custom questions");
  assert.strictEqual(receivedQuestions[0].question, q1Text, "Q1 MUST match the custom question added during job creation!");
  assert.strictEqual(receivedQuestions[1].question, q2Text, "Q2 MUST match the custom question added during job creation!");
  assert(!receivedQuestions.some(q => q.question.includes("FastAPI")), "MUST NOT contain default FastAPI question!");
  console.log(">>> SUCCESS: Exact custom questions added during job creation are present in Proctored Exam!");

  // Step 9: Proctored Exam Start when entering via Job ID directly (/exam/:jd_id/start)
  console.log("\n--- 9. Direct Job ID lookup in Proctored Exam (/exam/jd_.../start) ---");
  const directJobExamRes = await invokeServer('GET', `/exam/${jdId}/start`);
  assert.strictEqual(directJobExamRes.status, 200);
  const directQuestions = directJobExamRes.data.data.questions;
  assert.strictEqual(directQuestions[0].question, q1Text, "Direct Job ID lookup must also serve custom questions!");
  console.log("✓ Direct Job ID entry in Proctored Exam correctly serves custom questions!");

  // Step 10: Candidate Submits Exam Answers to Custom Questions
  console.log("\n--- 10. Candidate Submits Exam Answers to Custom Questions ---");
  const submitRes = await invokeServer('POST', `/exam/${examId}/submit`, {
    answers: [
      {
        question_id: q1Id,
        answer: "Raft ensures leader election safety and prevents split-brain by requiring a majority quorum (N/2 + 1) for leader election and log commits. In network partitions, only the majority partition can elect a leader, preventing two conflicting leaders."
      },
      {
        question_id: q2Id,
        answer: "Optimistic concurrency uses version numbers validated during commit, ideal for low write contention. Pessimistic concurrency locks rows or ranges beforehand to prevent conflicts under high write contention at the cost of lower throughput."
      }
    ]
  });
  assert.strictEqual(submitRes.status, 200);
  assert(submitRes.data.data.passed, "Exam should pass with strong technical answers");
  assert(submitRes.data.data.score_percent >= 80, `Expected high score, got ${submitRes.data.data.score_percent}%`);
  console.log(`✓ Exam evaluated and PASSED: ${submitRes.data.data.score_percent}% (${submitRes.data.data.marks_awarded}/${submitRes.data.data.marks_possible} marks)`);

  // Step 11: Exam Result Endpoint (/exam/:id/result)
  console.log("\n--- 11. Proctored Exam Result View ---");
  const resultRes = await invokeServer('GET', `/exam/${examId}/result`);
  assert.strictEqual(resultRes.status, 200);
  const results = resultRes.data.data.results;
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].question, q1Text);
  assert.strictEqual(results[0].reference_answer, q1Ref);
  assert.strictEqual(results[1].question, q2Text);
  assert.strictEqual(results[1].reference_answer, q2Ref);
  console.log("✓ Result page correctly displays custom questions and AI evaluation against custom reference answers!");

  // Step 12: Interviewer Portal View
  console.log("\n--- 12. Interviewer Portal Application View ---");
  const intRes = await invokeServer('GET', `/interviewer/applications/${appId}`);
  assert.strictEqual(intRes.status, 200);
  const intData = intRes.data.data;
  assert.strictEqual(intData.exam.answers.length, 2);
  assert.strictEqual(intData.exam.answers[0].question, q1Text);
  assert.strictEqual(intData.exam.answers[1].question, q2Text);
  console.log("✓ Interviewer sees exact custom questions and candidate submissions!");

  console.log("\n================================================================================");
  console.log(">>> ALL 12 IN-PROCESS E2E TESTS PASSED WITH 100% SUCCESS! <<<");
  console.log("================================================================================\n");
}

runTests().catch(err => {
  console.error("FATAL ERROR IN TEST:", err);
  process.exit(1);
});
