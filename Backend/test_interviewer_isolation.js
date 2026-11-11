const { server } = require('./local_proxy.js');
const { Readable } = require('stream');

function dispatch(method, urlStr, headers = {}, bodyObj = null) {
  return new Promise((resolve) => {
    const req = new Readable();
    req.method = method;
    req.url = urlStr;
    req.headers = { host: 'localhost:8000', accept: 'application/json', ...headers };

    if (bodyObj) {
      const data = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = Buffer.byteLength(data);
      req.push(data);
    }
    req.push(null);

    let resHeaders = {};
    let statusCode = 200;
    const resChunks = [];

    const res = {
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      getHeader(k) { return resHeaders[k.toLowerCase()]; },
      writeHead(code, h = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(h)) resHeaders[k.toLowerCase()] = v;
      },
      write(chunk) { if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
      end(chunk) {
        if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const bodyBuf = Buffer.concat(resChunks);
        let parsed = null;
        try { parsed = JSON.parse(bodyBuf.toString('utf8')); } catch {}
        resolve({
          statusCode,
          headers: resHeaders,
          bodyText: bodyBuf.toString('utf8'),
          bodyJson: parsed
        });
      }
    };

    server.emit('request', req, res);
  });
}

async function runTest() {
  console.log('=== VERIFYING INTERVIEWER PORTAL JD & APPLICATION ISOLATION ===\n');

  // 1. Default Interviewer 1 (Lead Technical Interviewer)
  const d1 = await dispatch('GET', '/interviewer/dashboard', {
    'x-interviewer-id': 'usr_interviewer_1',
    'x-interviewer-email': 'interviewer@example.com'
  });
  console.log('1. Interviewer 1 Dashboard:');
  console.log('   Profile:', d1.bodyJson?.data?.profile?.name, `(${d1.bodyJson?.data?.profile?.email})`);
  console.log('   Assigned Jobs count:', d1.bodyJson?.data?.counts?.assigned_jobs);
  console.log('   Assigned Apps count:', d1.bodyJson?.data?.counts?.assigned_total);
  if ((d1.bodyJson?.data?.counts?.assigned_jobs || 0) === 0) {
    throw new Error('Interviewer 1 should have assigned jobs');
  }

  // 2. Register New Interviewer 2
  const uniqueEmail = `priya.sharma_${Date.now()}@example.com`;
  const rSign2 = await dispatch('POST', '/auth/signup/interviewer', {}, {
    email: uniqueEmail,
    name: 'Priya Sharma',
    password: 'Password123!'
  });
  const int2Id = rSign2.bodyJson?.data?.user_id;
  const int2Token = rSign2.bodyJson?.data?.session_token;
  console.log('\n2. Created Interviewer 2:', int2Id, 'Priya Sharma', uniqueEmail);

  // 3. Interviewer 2 views dashboard BEFORE any job assigned
  const d2_initial = await dispatch('GET', '/interviewer/dashboard', {
    authorization: `Bearer ${int2Token}`,
    'x-interviewer-id': int2Id,
    'x-interviewer-email': uniqueEmail
  });
  console.log('3. Interviewer 2 Initial Dashboard:');
  console.log('   Profile:', d2_initial.bodyJson?.data?.profile?.name);
  console.log('   Assigned Jobs count:', d2_initial.bodyJson?.data?.counts?.assigned_jobs);
  console.log('   Assigned Apps count:', d2_initial.bodyJson?.data?.counts?.assigned_total);
  if (d2_initial.bodyJson?.data?.counts?.assigned_jobs !== 0 || d2_initial.bodyJson?.data?.counts?.assigned_total !== 0) {
    throw new Error(`Interviewer 2 should have 0 jobs and 0 applications, but got jobs=${d2_initial.bodyJson?.data?.counts?.assigned_jobs}, apps=${d2_initial.bodyJson?.data?.counts?.assigned_total}`);
  }
  console.log('   ✓ Interviewer 2 does NOT see Interviewer 1\'s JDs or applications!');

  // 4. Admin creates a specific new job ASSIGNED to Interviewer 2
  const rJob = await dispatch('POST', '/admin/jds/create', {}, {
    title: 'Senior Frontend Architect',
    description: 'React, TypeScript, Micro-frontends expert',
    interviewer_id: int2Id,
    screening_threshold: 70,
    exam_threshold: 60
  });
  const newJdId = rJob.bodyJson?.data?.jd_id;
  console.log('\n4. Admin created job for Interviewer 2:', newJdId, rJob.bodyJson?.data?.title);

  // 5. Interviewer 2 views dashboard AFTER job assigned
  const d2_after = await dispatch('GET', '/interviewer/dashboard', {
    authorization: `Bearer ${int2Token}`,
    'x-interviewer-id': int2Id,
    'x-interviewer-email': uniqueEmail
  });
  console.log('5. Interviewer 2 Dashboard after assignment:');
  console.log('   Assigned Jobs count:', d2_after.bodyJson?.data?.counts?.assigned_jobs);
  console.log('   Assigned Job Titles:', d2_after.bodyJson?.data?.assigned_jobs?.map(j => j.title));
  if (d2_after.bodyJson?.data?.counts?.assigned_jobs !== 1 || d2_after.bodyJson?.data?.assigned_jobs[0]?.title !== 'Senior Frontend Architect') {
    throw new Error('Interviewer 2 should only see Senior Frontend Architect');
  }
  console.log('   ✓ Interviewer 2 sees ONLY the job assigned to them!');

  // 6. Verify Interviewer 1 does NOT see Interviewer 2's new job
  const d1_after = await dispatch('GET', '/interviewer/dashboard', {
    'x-interviewer-id': 'usr_interviewer_1',
    'x-interviewer-email': 'interviewer@example.com'
  });
  const int1JobTitles = d1_after.bodyJson?.data?.assigned_jobs?.map(j => j.title) || [];
  console.log('6. Interviewer 1 Dashboard job titles count:', int1JobTitles.length);
  if (int1JobTitles.includes('Senior Frontend Architect')) {
    throw new Error('Interviewer 1 should NOT see Interviewer 2\'s job!');
  }
  console.log('   ✓ Interviewer 1 does NOT see Interviewer 2\'s job!');

  // 7. Candidate applies for Interviewer 2's job
  const rApply = await dispatch('POST', `/candidate/apply/${newJdId}`, {
    authorization: 'Bearer sess_cand_test_token',
    'x-candidate-email': 'applicant_frontend@example.com'
  }, {});
  console.log('\n7. Candidate applied for Interviewer 2\'s job:', rApply.bodyJson?.data?.app_id, rApply.bodyJson?.data?.status);

  // 8. Interviewer 2 applications list
  const d2_apps = await dispatch('GET', '/interviewer/applications', {
    authorization: `Bearer ${int2Token}`,
    'x-interviewer-id': int2Id,
    'x-interviewer-email': uniqueEmail
  });
  console.log('8. Interviewer 2 Applications count:', d2_apps.bodyJson?.data?.count);
  console.log('   Interviewer 2 Applications:', d2_apps.bodyJson?.data?.applications?.map(a => a.job_title));
  if (d2_apps.bodyJson?.data?.count !== 1) {
    throw new Error('Interviewer 2 should have exactly 1 application for their job');
  }

  // 9. Verify Interviewer 1 does NOT see this application
  const d1_apps = await dispatch('GET', '/interviewer/applications', {
    'x-interviewer-id': 'usr_interviewer_1',
    'x-interviewer-email': 'interviewer@example.com'
  });
  const int1AppJobs = d1_apps.bodyJson?.data?.applications?.map(a => a.job_title) || [];
  if (int1AppJobs.includes('Senior Frontend Architect')) {
    throw new Error('Interviewer 1 should NOT see application for Senior Frontend Architect!');
  }
  console.log('   ✓ Interviewer 1 does NOT see application for Senior Frontend Architect!');

  console.log('\n================================================================');
  console.log('>>> ALL INTERVIEWER ISOLATION TESTS PASSED WITH 100% SUCCESS! <<<');
  console.log('================================================================');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
