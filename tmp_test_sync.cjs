const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/auto-sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(`Status: ${res.statusCode}`); console.log('Response:', data); });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify({ timeframe: '1D' }));
req.end();
