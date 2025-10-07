const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../db/dev.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初期スキーマ
db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('image','model','text')),
  title TEXT,
  description TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  mediaUrl TEXT,
  thumbUrl TEXT,
  size INTEGER,
  contentType TEXT,
  originalName TEXT,
  createdBy TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  qrPayload TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  sessionId TEXT,
  spotId TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS spots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius REAL NOT NULL DEFAULT 50,
  meta TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 緯度経度の粗いインデックス（範囲絞り用）
CREATE INDEX IF NOT EXISTS idx_posts_lat ON posts(lat);
CREATE INDEX IF NOT EXISTS idx_posts_lng ON posts(lng);
`);

// posts.scanId を後付け（無ければ追加）
try {
  const hasScanId = db.prepare(`PRAGMA table_info(posts)`).all().some(c => c.name === 'scanId');
  if (!hasScanId) {
    db.exec(`ALTER TABLE posts ADD COLUMN scanId TEXT`);
  }
  // 新規メタ情報カラムの後付け
  const cols = db.prepare(`PRAGMA table_info(posts)`).all();
  if (!cols.some(c => c.name === 'contentType')) {
    db.exec(`ALTER TABLE posts ADD COLUMN contentType TEXT`);
  }
  if (!cols.some(c => c.name === 'originalName')) {
    db.exec(`ALTER TABLE posts ADD COLUMN originalName TEXT`);
  }
} catch (e) {
  // スキーマチェック失敗時も起動継続
}

module.exports = { db, DB_PATH };