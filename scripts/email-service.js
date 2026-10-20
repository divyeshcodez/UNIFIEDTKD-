const fs = require('fs');
const path = require('path');

// Auto-load .env file if it exists locally
const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const http = require('http');
const handler = require('../api/send-confirmation');

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  // Simple body parser
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      req.body = body ? JSON.parse(body) : {};
    } catch {
      req.body = {};
    }

    // Wrap Express-like response helpers for standalone HTTP server
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json');
      if (res.statusCode >= 400) {
        console.error(`⚠️ Email dispatch failed [${res.statusCode}]:`, data.error || data);
      }
      res.end(JSON.stringify(data));
      return res;
    };

    if (req.url === '/api/send-confirmation' || req.url === '/') {
      console.log(`\n📨 [${new Date().toLocaleTimeString()}] Processing confirmation for: ${req.body?.fullName || 'Anonymous'} -> ${req.body?.email || 'No email'}`);
      await handler(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found. Use /api/send-confirmation' }));
    }
  });
});

server.listen(PORT, () => {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  console.log(`\n======================================================`);
  console.log(`🥋 UNIFIEDTKD SMTP Email Service running on:`);
  console.log(`👉 http://localhost:${PORT}/api/send-confirmation`);
  console.log(`📧 SMTP_USER: ${user || 'NOT SET ⚠️ (Add to .env)'}`);
  console.log(`🔑 SMTP_PASS: ${pass ? 'Configured ✅' : 'NOT SET ⚠️ (Add 16-digit App Password to .env)'}`);
  console.log(`======================================================\n`);
});
