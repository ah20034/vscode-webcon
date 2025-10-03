// Simple Express web server (HTTP + optional HTTPS)
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const SSL_PORT = process.env.SSL_PORT || 3443;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Basic health-check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Temporarily block AR page
app.get(['/ar', '/ar.html'], (req, res) => {
  res.status(404).send('Not Found');
});

// Fallback for all other routes (Express v5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start HTTP server
http.createServer(app).listen(PORT, () => {
  console.log(`HTTP  server is running at http://localhost:${PORT}`);
});

// Optionally start HTTPS server if certs exist (ssl/server.key & ssl/server.crt)
try {
  const sslDir = path.join(__dirname, 'ssl');
  const keyPath = process.env.SSL_KEY_PATH || path.join(sslDir, 'server.key');
  const certPath = process.env.SSL_CERT_PATH || path.join(sslDir, 'server.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    https.createServer(httpsOptions, app).listen(SSL_PORT, () => {
      console.log(`HTTPS server is running at https://localhost:${SSL_PORT}`);
    });
  } else {
    console.log('HTTPS disabled: certificate files not found. Expected at:');
    console.log(`  key:  ${keyPath}`);
    console.log(`  cert: ${certPath}`);
  }
} catch (err) {
  console.error('Failed to start HTTPS server:', err.message);
}
