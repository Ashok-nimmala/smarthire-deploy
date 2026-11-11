/**
 * test_candidate_isolation.js
 * Verifies that:
 * 1. Newly created candidate accounts do NOT see previous candidates' applications.
 * 2. Normal screening allows candidates with "somewhat good" match to pass screening.
 * 3. Each candidate account is strictly isolated.
 */

const assert = require('assert');
const http = require('http');
const { server, screenResumeAgainstJD } = require('./local_proxy');

function makeRequest(path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:8000/${path.replace(/^\/+/, '')}`, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// In-process handler caller to avoid sandbox socket restrictions
const url = require('url');

async function handleRequest(path, method = 'GET', headers = {}, bodyObj = null) {
  const reqUrl = `http://localhost:8000/${path.replace(/^\/+/, '')}`;
  const parsed = url.parse(reqUrl, true);
  
  const reqChunks = bodyObj ? [Buffer.from(typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj))] : [];
  
  let resolveRes;
  const promise = new Promise(resolve => resolveRes = resolve);

  const mockReq = {
    method,
    url: reqUrl,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of reqChunks) {
        yield chunk;
      }
    }
  };

  let responseStatusCode = 200;
  let responseHeaders = {};
  let responseBody = '';

  const mockRes = {
    setHeader: (k, v) => { responseHeaders[k.toLowerCase()] = v; },
    writeHead: (code, hdrs) => {
      responseStatusCode = code;
      if (hdrs) Object.assign(responseHeaders, hdrs);
    },
    end: (content) => {
      if (content) responseBody += content.toString();
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch {
        parsedJson = responseBody;
      }
      resolveRes({ status: responseStatusCode, headers: responseHeaders, data: parsedJson });
    }
  };

  await server.emit('request', mockReq, mockRes);
  return promise;
}

async function runTests() {
  console.log("==================================================================");
  console.log(">>> VERIFYING CANDIDATE ISOLATION & NORMAL SCREENING LOGIC <<<");
  console.log("==================================================================");

  // 1. Existing Demo Candidate (Ashok)
  console.log("\n1. Verifying Demo Candidate has pre-seeded applications...");
  const demoLogin = await handleRequest('auth/login?email=candidate_test_1@example.com', 'GET', {
    referer: 'http://localhost:5174/login'
  });
  const demoToken = demoLogin.data?.data?.session_token;
  console.log("Demo Token:", demoToken);

  const demoApps = await handleRequest('candidate/me/applications', 'GET', {
    'authorization': `Bearer ${demoToken}`
  });
  console.log("Demo Candidate Applications Count:", demoApps.data?.data?.count);
  assert.strictEqual(demoApps.data?.data?.count, 2, "Demo candidate should have 2 applications");
  console.log("✓ Demo candidate has their 2 pre-seeded applications.");

  // 2. Newly Created Candidate Account (Signup)
  console.log("\n2. Testing Newly Created Account Signup (/auth/signup/candidate)...");
  const newEmail = `john.doe.${Date.now()}@example.com`;
  const signupRes = await handleRequest(`auth/signup/candidate?name=John Doe&email=${newEmail}&password=Pass1234`, 'POST', {
    referer: 'http://localhost:5174/login'
  });
  const newToken = signupRes.data?.data?.session_token;
  const newUserId = signupRes.data?.data?.user_id;
  console.log("New Candidate Signed Up:", { name: "John Doe", email: newEmail, token: newToken, user_id: newUserId });

  // 3. Newly Created Candidate Checks Applications (MUST BE ZERO!)
  console.log("\n3. Testing Newly Created Account Applications (/candidate/me/applications)...");
  const newCandApps = await handleRequest('candidate/me/applications', 'GET', {
    'authorization': `Bearer ${newToken}`
  });
  console.log("New Candidate Applications Count:", newCandApps.data?.data?.count);
  assert.strictEqual(newCandApps.data?.data?.count, 0, "Brand new candidate MUST HAVE 0 applications (not previous candidates' applications!)");
  console.log("✓ Newly created account starts with 0 applications (NO previous candidates' applications shown)!");

  // 4. Newly Created Candidate Dashboard (MUST SHOW 0 APPLICATIONS!)
  console.log("\n4. Testing Newly Created Account Dashboard (/candidate/dashboard)...");
  const newCandDash = await handleRequest('candidate/dashboard', 'GET', {
    'authorization': `Bearer ${newToken}`
  });
  console.log("Dashboard Applications Count:", newCandDash.data?.data?.counts?.applications);
  assert.strictEqual(newCandDash.data?.data?.counts?.applications, 0, "Dashboard counts must show 0 applications for new candidate");
  console.log("✓ Dashboard confirms 0 applications for the new account!");

  // 5. Test Normal (Not Overly Strict) Screening with Somewhat Good Match
  console.log("\n5. Testing Normal Screening with 'Somewhat Good' Candidate Match...");
  const modestPythonJD = {
    title: "Senior Python Backend Engineer",
    description: "Seeking a Python Engineer with Python, FastAPI, DynamoDB, and REST APIs.",
    screening_threshold: 70
  };
  const modestCandidateResume = `
John Doe
Software Engineer
Email: ${newEmail}
Summary: Software engineer with 2 years of experience developing web applications and REST APIs using Python, PostgreSQL, and Git.
`;
  const screenModest = screenResumeAgainstJD(modestPythonJD, modestCandidateResume);
  console.log("Somewhat Good Screening Result:", {
    score: screenModest.score,
    threshold: screenModest.threshold,
    passed: screenModest.passed,
    matched_skills: screenModest.matched_skills
  });
  assert(screenModest.passed === true, "Somewhat good candidate with Python & REST APIs MUST pass screening!");
  assert(screenModest.score >= 70, `Score should be >= 70, got ${screenModest.score}`);
  console.log("✓ Normal screening passed the 'somewhat good' candidate with score >= 70%!");

  // 6. Candidate Applies to Job
  console.log("\n6. Testing New Candidate Applies to Job (/candidate/apply/jd_08b1d1a4502c46ba)...");
  const applyRes = await handleRequest('candidate/apply/jd_08b1d1a4502c46ba', 'GET', {
    'authorization': `Bearer ${newToken}`
  });
  console.log("Application Result:", {
    app_id: applyRes.data?.data?.app_id,
    candidate_name: applyRes.data?.data?.candidate_name,
    candidate_email: applyRes.data?.data?.candidate_email,
    status: applyRes.data?.data?.status,
    screening_score: applyRes.data?.data?.screening?.score
  });
  assert.strictEqual(applyRes.data?.data?.status, "SCREENING_PASSED", "New candidate should pass normal screening on apply");
  assert.strictEqual(applyRes.data?.data?.candidate_email, newEmail);
  console.log("✓ Application created and passed screening under new candidate's account!");

  // 7. Re-check New Candidate Applications (Now has exactly 1 application)
  console.log("\n7. Re-checking New Candidate Applications (/candidate/me/applications)...");
  const updatedNewApps = await handleRequest('candidate/me/applications', 'GET', {
    'authorization': `Bearer ${newToken}`
  });
  console.log("Updated New Candidate Applications Count:", updatedNewApps.data?.data?.count);
  assert.strictEqual(updatedNewApps.data?.data?.count, 1, "New candidate should now have exactly 1 application");
  console.log("✓ New candidate now sees only their 1 application!");

  // 8. Re-check Demo Candidate Applications (Still has exactly 2 applications)
  console.log("\n8. Re-checking Demo Candidate Applications (/candidate/me/applications)...");
  const recheckDemoApps = await handleRequest('candidate/me/applications', 'GET', {
    'authorization': `Bearer ${demoToken}`
  });
  console.log("Demo Candidate Applications Count:", recheckDemoApps.data?.data?.count);
  assert.strictEqual(recheckDemoApps.data?.data?.count, 2, "Demo candidate should still have only their 2 applications");
  console.log("✓ Isolation confirmed: Demo candidate does NOT see the new candidate's application!");

  console.log("\n==================================================================");
  console.log(">>> ALL CANDIDATE ISOLATION & NORMAL SCREENING TESTS PASSED! <<<");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

