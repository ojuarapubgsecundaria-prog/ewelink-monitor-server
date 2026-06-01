const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "ewelink.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ewelink_app_id TEXT,
    ewelink_app_secret TEXT,
    alert_type TEXT NOT NULL DEFAULT 'telegram',
    monitoring_enabled INTEGER NOT NULL DEFAULT 0,
    interval_seconds INTEGER NOT NULL DEFAULT 60
  );

  INSERT OR IGNORE INTO settings (id, ewelink_app_id, ewelink_app_secret, alert_type, monitoring_enabled, interval_seconds)
  VALUES (1, NULL, NULL, 'telegram', 0, 60);

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    session_id TEXT,
    user_email TEXT,
    user_nickname TEXT,
    access_token TEXT,
    refresh_token TEXT,
    region TEXT DEFAULT 'us',
    created_at INTEGER
  );

  INSERT OR IGNORE INTO sessions (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS device_states (
    device_id TEXT PRIMARY KEY,
    device_name TEXT,
    online INTEGER NOT NULL DEFAULT 1,
    last_seen INTEGER,
    alert_sent INTEGER NOT NULL DEFAULT 0
  );
`);

// ─── Settings ────────────────────────────────────────────────────────────────

function getSettings() {
  return db.prepare("SELECT * FROM settings WHERE id = 1").get();
}

function updateSettings(data) {
  db.prepare(`
    UPDATE settings SET
      ewelink_app_id = @ewelink_app_id,
      ewelink_app_secret = @ewelink_app_secret,
      alert_type = @alert_type,
      monitoring_enabled = @monitoring_enabled,
      interval_seconds = @interval_seconds
    WHERE id = 1
  `).run(data);
  return getSettings();
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function getSession() {
  return db.prepare("SELECT * FROM sessions WHERE id = 1").get();
}

function saveSession(data) {
  db.prepare(`
    INSERT INTO sessions (id, session_id, user_email, user_nickname, access_token, refresh_token, region, created_at)
    VALUES (1, @session_id, @user_email, @user_nickname, @access_token, @refresh_token, @region, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      user_email = excluded.user_email,
      user_nickname = excluded.user_nickname,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      region = excluded.region,
      created_at = excluded.created_at
  `).run(data);
}

function clearSession() {
  db.prepare(`
    UPDATE sessions SET session_id=NULL, user_email=NULL, user_nickname=NULL,
    access_token=NULL, refresh_token=NULL, region=NULL, created_at=NULL WHERE id=1
  `).run();
}

// ─── Device States ────────────────────────────────────────────────────────────

function getDeviceState(deviceId) {
  return db.prepare("SELECT * FROM device_states WHERE device_id = ?").get(deviceId);
}

function upsertDeviceState(deviceId, deviceName, online) {
  const now = Date.now();
  const existing = getDeviceState(deviceId);
  if (!existing) {
    db.prepare(`
      INSERT INTO device_states (device_id, device_name, online, last_seen, alert_sent)
      VALUES (?, ?, ?, ?, 0)
    `).run(deviceId, deviceName, online ? 1 : 0, now);
    return { changed: false, wentOffline: false };
  }
  const wasOnline = existing.online === 1;
  const isOnline = !!online;
  const changed = wasOnline !== isOnline;
  const wentOffline = changed && !isOnline;
  const alertSent = wentOffline ? 0 : (changed && isOnline ? 0 : existing.alert_sent);
  db.prepare(`
    UPDATE device_states SET device_name=?, online=?, last_seen=?, alert_sent=?
    WHERE device_id=?
  `).run(deviceName, isOnline ? 1 : 0, now, alertSent, deviceId);
  return { changed, wentOffline, wasOnline };
}

function markAlertSent(deviceId) {
  db.prepare("UPDATE device_states SET alert_sent=1 WHERE device_id=?").run(deviceId);
}

function getAllDeviceStates() {
  return db.prepare("SELECT * FROM device_states").all();
}

module.exports = {
  getSettings,
  updateSettings,
  getSession,
  saveSession,
  clearSession,
  getDeviceState,
  upsertDeviceState,
  markAlertSent,
  getAllDeviceStates,
};
