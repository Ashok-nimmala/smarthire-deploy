const { server } = require('./local_proxy.js');
const { Readable } = require('stream');

function dispatch(method, urlStr, headers = {}) {
  return new Promise((resolve) => {
    const req = new Readable();
    req.method = method;
    req.url = urlStr;
    req.headers = { host: 'localhost:8000', accept: 'application/json', ...headers };
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
          bodyJson: parsed
        });
      }
    };

    server.emit('request', req, res);
  });
}

async function testAdmin() {
  console.log('Testing Admin Dashboard payload...');
  const res = await dispatch('GET', '/admin/dashboard', {
    authorization: 'Bearer sess_admin_token_local'
  });

  console.log('Response status:', res.statusCode);
  console.log('Data:', JSON.stringify(res.bodyJson?.data, null, 2));

  const data = res.bodyJson?.data;
  const stats = data?.stats || data?.totals || data?.summary || data || {};
  const statValue = (...keys) => {
    for (const k of keys) {
      if (stats && stats[k] !== undefined && stats[k] !== null) return stats[k];
      if (data && data[k] !== undefined && data[k] !== null) return data[k];
    }
    return 0;
  };

  console.log('\nCalculated Stat Cards:');
  console.log('Total Jobs:', statValue('total_jobs', 'jobs'));
  console.log('Live Jobs:', statValue('live_jobs', 'active_jobs', 'published_jobs'));
  console.log('Total Applications:', statValue('total_applications', 'applications'));
  console.log('Interviewers:', statValue('interviewers', 'total_interviewers'));
  console.log('Job count in summary table:', data?.jobs?.length);

  if (statValue('total_jobs', 'jobs') === 0 || statValue('interviewers', 'total_interviewers') === 0) {
    throw new Error('Stats are still 0!');
  }

  console.log('\n>>> ADMIN DASHBOARD STATS VERIFIED SUCCESSFULLY! <<<');
}

testAdmin().catch(e => {
  console.error(e);
  process.exit(1);
});

