const http = require('http');

const req = http.request({
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/community/test-id-123',
  method: 'DELETE'
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("DELETE ROUTE STATUS:", res.statusCode);
    console.log("DELETE ROUTE RESPONSE:", body);
  });
});

req.on('error', (err) => console.error(err));
req.end();
