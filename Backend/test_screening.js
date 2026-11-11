/**
 * test_screening.js
 * In-process unit test verifying the updated user specification:
 * - If internal match is >= 10%, it is converted to > 80% and passes screening.
 * - If internal match is < 10%, it is rejected.
 */

const assert = require('assert');
const fs = require('fs');

const proxyCode = fs.readFileSync(__dirname + '/local_proxy.js', 'utf8');

// Extract the screenResumeAgainstJD function
const fnStart = proxyCode.indexOf('function screenResumeAgainstJD');
const fnEnd = proxyCode.indexOf('function formatInterviewerApp');
const screenResumeAgainstJD = new Function(
  proxyCode.slice(fnStart, fnEnd) + '; return screenResumeAgainstJD;'
)();

const pythonResume = `
Ashok Nimmala
Senior Python & Cloud Backend Engineer
Email: candidate_test_1@example.com

PROFESSIONAL SUMMARY
Experienced Software Engineer with 4+ years of expertise in designing and deploying scalable backend services, asynchronous APIs, and cloud infrastructure. Proficient in Python, FastAPI, Django, PostgreSQL, AWS DynamoDB, Docker, and Kubernetes. Strong background in microservices architecture, CI/CD automation, and Linux environments.

TECHNICAL SKILLS
- Programming Languages: Python, Bash, SQL, JavaScript
- Frameworks & Libraries: FastAPI, Django, Flask, Starlette, Pydantic, SQLAlchemy
- Databases: PostgreSQL, AWS DynamoDB, Redis, MySQL
- Cloud & DevOps: AWS (EC2, S3, VPC, IAM, EKS), Docker, Kubernetes, CI/CD, Terraform
- Architecture: RESTful APIs, Microservices, Asynchronous Concurrency (ASGI, asyncio)
- Tools: Git, Linux, Postman, pytest
`;

console.log("=== TEST 1: Matching Role (Senior Python Backend Engineer) ===");
const pythonJD = {
  title: "Senior Python Backend Engineer",
  description: "We are seeking a Senior Python Backend Engineer experienced with Python 3, FastAPI, AWS DynamoDB, REST APIs, and automated testing.",
  screening_threshold: 70
};

const result1 = screenResumeAgainstJD(pythonJD, pythonResume);
console.log("Python JD Screening Result:", {
  score: result1.score,
  threshold: result1.threshold,
  passed: result1.passed,
  matched_skills: result1.matched_skills
});

assert(result1.passed === true, "Candidate SHOULD PASS Python Backend Engineer job");
assert(result1.score >= 80, `Score should be converted to > 80%, got ${result1.score}`);
console.log(`✓ Candidate passed screening with converted score: ${result1.score}%!`);

console.log("\n=== TEST 2: User Scenario (Internal Match 28% for Python, Java, React, Next.js JD) ===");
const userJD = {
  title: "Full Stack Software Developer",
  description: "We are looking for a developer experienced in Python, Java, React, and Next.js for fullstack development.",
  screening_threshold: 70
};

// Candidate with Python & backend skills (got 28% in old logic)
const userCandidateResume = `
Rahul Sharma
Software Developer
Email: rahul@example.com
Summary: Software developer with experience in Python, web development, REST APIs, and PostgreSQL.
`;

const result2 = screenResumeAgainstJD(userJD, userCandidateResume);
console.log("User Scenario Screening Result:", {
  score: result2.score,
  threshold: result2.threshold,
  passed: result2.passed,
  matched_skills: result2.matched_skills
});

assert(result2.passed === true, "Candidate with internal match > 10% MUST be converted to > 80% and pass screening!");
assert(result2.score >= 80, `Score should be >= 80%, got ${result2.score}`);
console.log(`✓ User scenario cleared: score converted to ${result2.score}% (> 80%) and screening PASSED!`);

console.log("\n=== TEST 3: Candidate with Internal Match Under 10% (Completely Non-Technical / Unrelated) ===");
const unrelatedJD = {
  title: "Principal Quantum Computing Research Scientist",
  description: "Advanced PhD research in superconducting qubits, cryogenic microwave electronics, pulse sequencing, and Qiskit.",
  screening_threshold: 70
};

const nonTechResume = "Commercial truck driver with 10 years CDL license driving across cross-country freight lines.";
const result3 = screenResumeAgainstJD(unrelatedJD, nonTechResume);
console.log("Unrelated JD Screening Result:", {
  score: result3.score,
  threshold: result3.threshold,
  passed: result3.passed
});

assert(result3.passed === false, "Candidate with internal match < 10% MUST be rejected!");
assert(result3.score < 10, `Score should be < 10%, got ${result3.score}`);
console.log(`✓ Unrelated candidate with internal match < 10% was correctly REJECTED with score ${result3.score}%!`);

console.log("\n=== TEST 4: Empty / Unreadable Resume (< 10%) ===");
const result4 = screenResumeAgainstJD(pythonJD, "");
console.log("Empty Resume Result:", {
  score: result4.score,
  passed: result4.passed
});
assert(result4.passed === false, "Empty resume MUST be rejected");
assert(result4.score < 10, `Score should be < 10%, got ${result4.score}`);
console.log(`✓ Empty resume rejected with score ${result4.score}% (< 10%)!`);

console.log("\n=========================================");
console.log(">>> ALL SCREENING UNIT TESTS PASSED! <<<");
console.log("=========================================");
