const { getSession, getSettings, upsertDeviceState, markAlertSent, getAllDeviceStates } = require("./database");
const { getDevices, getAppCredentials } = require("./ewelink");
const { sendOfflineAlerts } = require("./alerts");

let monitorTimer = null;
let isRunning = false;

async function checkDevices() {
  if (isRunning) return;
  isRunning = true;

  try {
    const session = getSession();
    if (!session?.access_token) {
      console.log("[Monitor] Sem sessão ativa, pulando verificação.");
      return;
    }

    const { appId, appSecret } = getAppCredentials();
    if (!appId || !appSecret) {
      console.log("[Monitor] Credenciais não configuradas.");
      return;
    }

    const region = session.region || "us";
    const devices = await getDevices(session.access_token, region, appId, appSecret);
    console.log(`[Monitor] ${devices.length} dispositivo(s) encontrado(s).`);

    for (const device of devices) {
      const result = upsertDeviceState(device.id, device.name, device.online);

      if (result.wentOffline) {
        console.log(`[Monitor] ⚠️ Dispositivo OFFLINE: ${device.name}`);
        await sendOfflineAlerts(device.name);
        markAlertSent(device.id);
      } else if (!result.changed) {
        const state = require("./database").getDeviceState(device.id);
        if (!device.online && state && state.alert_sent === 0) {
          console.log(`[Monitor] ⚠️ Dispositivo ainda OFFLINE (alerta pendente): ${device.name}`);
          await sendOfflineAlerts(device.name);
          markAlertSent(device.id);
        }
      }
    }
  } catch (err) {
    console.error("[Monitor] Erro na verificação:", err.message);
  } finally {
    isRunning = false;
  }
}

function startMonitor(sessionId) {
  const settings = getSettings();
  const intervalMs = (settings?.interval_seconds || 60) * 1000;

  stopMonitor();

  console.log(`[Monitor] Iniciando monitoramento a cada ${settings?.interval_seconds || 60}s`);
  checkDevices();
  monitorTimer = setInterval(checkDevices, intervalMs);
}

function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[Monitor] Monitoramento parado.");
  }
}

function restartWithCurrentSettings() {
  if (monitorTimer) {
    startMonitor();
  }
}

module.exports = { startMonitor, stopMonitor, checkDevices, restartWithCurrentSettings };
