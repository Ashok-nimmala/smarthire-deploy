const { server } = require('./local_proxy.js');
const { Readable } = require('stream');

function dispatchRequest(method, urlStr, headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const req = new Readable();
    req.method = method;
    req.url = urlStr;
    req.headers = { host: 'localhost:8000', ...headers };

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
      writeHead(code, headers = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(headers)) {
          resHeaders[k.toLowerCase()] = v;
        }
      },
      write(chunk) {
        if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(chunk) {
        if (chunk) resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const bodyBuf = Buffer.concat(resChunks);
        resolve({
          statusCode,
          headers: resHeaders,
          bodyText: bodyBuf.toString('utf8'),
          bodyJson: (() => {
            try { return JSON.parse(bodyBuf.toString('utf8')); } catch { return null; }
          })()
        });
      }
    };

    server.emit('request', req, res);
  });
}

async function testGateway() {
  console.log('Testing Unified Gateway Serving and Auth Endpoints:');

  // 1. GET /
  const rRoot = await dispatchRequest('GET', '/');
  console.log('1. GET / status:', rRoot.statusCode, 'contains gateway title:', rRoot.bodyText.includes('SmartHire — Unified Access Gateway'));
  if (rRoot.statusCode !== 200 || !rRoot.bodyText.includes('SmartHire — Unified Access Gateway')) {
    throw new Error('GET / did not serve gateway HTML!');
  }

  // 2. Candidate Login with role selector
  const rCand = await dispatchRequest('POST', '/auth/login', { 'content-type': 'application/json' }, {
    email: 'new_cand@example.com',
    password: 'Password123!',
    role: 'candidate'
  });
  console.log('2. Candidate login:', rCand.statusCode, rCand.bodyJson?.data?.role);
  if (rCand.bodyJson?.data?.role !== 'candidate') throw new Error('Role was not candidate');

  // 3. Interviewer Login with role selector
  const rInt = await dispatchRequest('POST', '/auth/login', { 'content-type': 'application/json' }, {
    email: 'interviewer_test@example.com',
    password: 'Password123!',
    role: 'interviewer'
  });
  console.log('3. Interviewer login:', rInt.statusCode, rInt.bodyJson?.data?.role, rInt.bodyJson?.data?.name);
  if (rInt.bodyJson?.data?.role !== 'interviewer') throw new Error('Role was not interviewer');

  // 4. Admin Login with role selector
  const rAdmin = await dispatchRequest('POST', '/auth/login', { 'content-type': 'application/json' }, {
    email: 'custom_admin@example.com',
    password: 'Password123!',
    role: 'admin'
  });
  console.log('4. Admin login:', rAdmin.statusCode, rAdmin.bodyJson?.data?.role);
  if (rAdmin.bodyJson?.data?.role !== 'admin') throw new Error('Role was not admin');

  // 5. Interviewer Signup
  const rIntSign = await dispatchRequest('POST', '/auth/signup/interviewer', { 'content-type': 'application/json' }, {
    email: 'new_tech_lead@bnp.com',
    password: 'Password123!',
    name: 'New Tech Lead'
  });
  console.log('5. Interviewer signup:', rIntSign.statusCode, rIntSign.bodyJson?.data?.name, rIntSign.bodyJson?.data?.role);
  if (rIntSign.bodyJson?.data?.role !== 'interviewer') throw new Error('Interviewer signup failed');

  console.log('\n>>> ALL GATEWAY TESTS PASSED! <<<');
}

testGateway().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
