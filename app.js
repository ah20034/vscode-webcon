// Simple Express web server (HTTP + optional HTTPS)
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const { db } = require('./server/db/sqlite');
const { haversineMeters, bbox } = require('./server/services/geo');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const SSL_PORT = parseInt(process.env.SSL_PORT || '3443', 10);

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ボディ
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 静的配信
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough: true }));

// Multer: ローカル保存
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_MB || '20', 10)) * 1024 * 1024 },
});

// SQL prepared statements
const stmtInsertPost = db.prepare(`
  INSERT INTO posts (id, type, title, description, lat, lng, mediaUrl, thumbUrl, size, contentType, originalName, createdBy, scanId)
  VALUES (@id, @type, @title, @description, @lat, @lng, @mediaUrl, @thumbUrl, @size, @contentType, @originalName, @createdBy, @scanId)
`);
const stmtListByBox = db.prepare(`
  SELECT * FROM posts
  WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
  ORDER BY createdAt DESC
  LIMIT 500
`);
const stmtInsertScan = db.prepare(`
  INSERT INTO scans (id, qrPayload, lat, lng, sessionId, spotId)
  VALUES (@id, @qrPayload, @lat, @lng, @sessionId, @spotId)
`);
const stmtListLatest = db.prepare(`
  SELECT * FROM posts ORDER BY datetime(createdAt) DESC LIMIT 20
`);
const stmtListByQR = db.prepare(`
  SELECT p.* FROM posts p
  JOIN scans s ON p.scanId = s.id
  WHERE s.qrPayload = ?
  ORDER BY datetime(p.createdAt) DESC
  LIMIT ?
`);

// API: 近傍取得（ハバースイン）
app.get('/api/posts/near', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 200);
  const limit = Math.min(Number(req.query.limit || 50), 200);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat,lng が必要です' });
  }
  const box = bbox(lat, lng, radius);
  const rows = stmtListByBox.all(box.minLat, box.maxLat, box.minLng, box.maxLng);
  const items = rows.map(r => ({
    ...r,
    distance: haversineMeters(lat, lng, r.lat, r.lng)
  }))
  .filter(r => r.distance <= radius)
  .sort((a,b) => a.distance - b.distance)
  .slice(0, limit);
  res.json({ items });
});

// API: 最新一覧
app.get('/api/posts', (_req, res) => {
  const items = stmtListLatest.all();
  res.json({ items });
});

// API: QRに紐づく投稿一覧
app.get('/api/posts/by-qr', (req, res) => {
  const qr = (req.query.qr || '').toString();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  if (!qr) return res.status(400).json({ error: 'qr が必要です' });
  try {
    const items = stmtListByQR.all(qr, limit);
    res.json({ items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'by_qr_failed' });
  }
});

// API: 投稿作成（multipart: media + fields）
app.post('/api/posts', upload.single('media'), (req, res) => {
  try {
    const { type, title, description, lat, lng, createdBy } = req.body;
    const { scanId } = req.body; // ← フロントから渡す
    const latN = Number(lat), lngN = Number(lng);
    if (!type || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'type, lat, lng は必須' });
    }
    const id = uuidv4();
    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const size = req.file ? req.file.size : null;
    const contentType = req.file ? req.file.mimetype : null;
    const originalName = req.file ? req.file.originalname : null;

    stmtInsertPost.run({
      id, type, title: title || null, description: description || null,
      lat: latN, lng: lngN, mediaUrl, thumbUrl: null, size,
      contentType, originalName,
      createdBy: createdBy || null, scanId: scanId || null
    });
    res.status(201).json({ id, type, title, description, lat: latN, lng: lngN, mediaUrl, size, contentType, originalName, createdBy, scanId: scanId || null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create_failed' });
  }
});

// API: スキャン保存
app.post('/api/scans', (req, res) => {
  try {
    const { qrPayload, lat, lng, sessionId, spotId } = req.body || {};
    const latN = Number(lat), lngN = Number(lng);
    if (!qrPayload || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: 'qrPayload, lat, lng は必須' });
    }
    const id = uuidv4();
    stmtInsertScan.run({ id, qrPayload, lat: latN, lng: lngN, sessionId: sessionId || null, spotId: spotId || null });
    res.status(201).json({ id, ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'scan_failed' });
  }
});

// ヘルス
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// フォールバック（静的SPA想定）
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// HTTP
http.createServer(app).listen(PORT, () => {
  console.log(`[HTTP] http://localhost:${PORT}`);
});

// HTTPS（任意）
const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'ssl', 'server.key');
const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'ssl', 'server.crt');
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const creds = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  https.createServer(creds, app).listen(SSL_PORT, () => {
    console.log(`[HTTPS] https://localhost:${SSL_PORT}`);
  });
} else {
  console.log('[HTTPS] 証明書が無いためHTTPSは無効です。');
}