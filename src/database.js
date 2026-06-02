const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const SESSION_FILE = path.join(DATA_DIR, "session.json");
const DEVICES_FILE = path.join(DATA_DIR, "devices.json");

function readJson(file, defaultVal) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  return defaultVal;
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function getSettings() {
  return readJson(SETTINGS_FILE, {
    ewelink_app_id: null,
    ewelink_app_secret: null,
    alert_type: "telegram",
    monitoring_enabled: 0,
    interval_seconds: 60,
  });
}

function updateSettings(data) {
  writeJson(SETTINGS_FILE, data);
  return getSettings();
}

function getSession() {
  return readJson(SESSION_FILE, null);
}

function saveSession(data) {
  writeJson(SESSION_FILE, data);
}

function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

function getAllDeviceStatesRaw() {
  return readJson(DEVICES_FILE, {});
}

function getDeviceState(deviceId) {
  return getAllDeviceStatesRaw()[deviceId] || null;
}

function upsertDeviceState(deviceId, deviceName, online) {
  const all = getAllDeviceStatesRaw();
  const now = Date.now();
  const existing = all[deviceId];

  if (!existing) {
    all[deviceId] = {
      device_id: deviceId,
      device_name: deviceName,
      online: online ? 1 : 0,
      last_seen: now,
      alert_sent: 0,
    };
    writeJson(DEVICES_FILE, all);
    return { changed: false, wentOffline: false };
  }

  const wasOnline = existing.online === 1;
  const isOnline = !!online;
  const changed = wasOnline !== isOnline;
  const wentOffline = changed && !isOnline;

  all[deviceId] = {
    ...existing,
    device_name: deviceName,
    online: isOnline ? 1 : 0,
    last_seen: now,
    alert_sent: wentOffline ? 0 : existing.alert_sent,
  };
  writeJson(DEVICES_FILE, all);
  return { changed, wentOffline, wasOnline };
}

function markAlertSent(deviceId) {
  const all = getAllDeviceStatesRaw();
  if (all[deviceId]) {
    all[deviceId].alert_sent = 1;
    writeJson(DEVICES_FILE, all);
  }
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
  getAllDeviceStates: () => Object.values(getAllDeviceStatesRaw()),
};
