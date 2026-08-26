const http = require('http');

const data = JSON.stringify({
  email: "admin@globetrotter.com",
  password: "adminpassword123"
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("LOGIN RESPONSE STATUS:", res.statusCode);
    console.log("LOGIN RESPONSE BODY:", body);
  });
});

req.on('error', (err) => console.error("HTTP Request Error:", err));
req.write(data);
req.end();
