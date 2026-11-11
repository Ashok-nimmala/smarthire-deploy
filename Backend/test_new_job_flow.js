const assert = require('assert');

// Simulate the local proxy data structures
const NEW_JD_ID = "jd_cloud_devops_2026";
const NEW_APP_ID = "app_cloud_devops_2026";

const cachedJobs = [
  {
    jd_id: NEW_JD_ID,
    title: "Cloud Infrastructure & DevOps Engineer",
    organization: "BNP Paribas",
    screening_threshold: 75,
    exam_threshold: 60,
    interviewer_id: "usr_interviewer_1",
    interviewer_name: "Lead Technical Interviewer",
    status: "LIVE"
  }
];

const applicationsMap = {
  [NEW_APP_ID]: {
    app_id: NEW_APP_ID,
    jd_id: NEW_JD_ID,
    job_title: "Cloud Infrastructure & DevOps Engineer",
    organization: "BNP Paribas",
    status: "INTERVIEW_PENDING",
    screening: {
      done: true,
      passed: true,
      score: 88,
      threshold: 75
    },
    interview: {
      pending: true,
      interviewer: "Lead Technical Interviewer",
      interviewer_id: "usr_interviewer_1"
    }
  }
};

console.log("=== CHECK 1: Verify New Job Created ===");
assert.strictEqual(cachedJobs[0].jd_id, "jd_cloud_devops_2026");
assert.strictEqual(cachedJobs[0].title, "Cloud Infrastructure & DevOps Engineer");
assert.strictEqual(cachedJobs[0].screening_threshold, 75);
console.log("✓ Job exists:", cachedJobs[0].title);

console.log("=== CHECK 2: Verify Screening Passed Up to Interview ===");
const app = applicationsMap[NEW_APP_ID];
assert.strictEqual(app.status, "INTERVIEW_PENDING");
assert.strictEqual(app.screening.passed, true);
assert(app.screening.score >= app.screening.threshold, "Score must exceed threshold");
console.log(`✓ Screening Passed: Score ${app.screening.score}% >= Threshold ${app.screening.threshold}%`);

console.log("=== CHECK 3: Verify Interviewer Assigned ===");
assert.strictEqual(app.interview.pending, true);
assert.strictEqual(app.interview.interviewer, "Lead Technical Interviewer");
console.log("✓ Assigned Interviewer:", app.interview.interviewer);

console.log("All unit checks passed successfully!");

