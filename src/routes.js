const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("./database");
const ewelinkLib = require("./ewelink");
const { startMonitor, stopMonitor, restartWithCurrentSettings } = require("./monitor");

const SERVER_URL = () => process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const REDIRECT_URL = () => `${SERVER_URL()}/api/ewelink/oauth/callback`;

// ─── Health ───────────────────────────────────────────────────────────────────

router.get("/healthz", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/settings", (req, res) => {
  const s = db.getSettings();
  res.json({
    ewelinkAppId: s.ewelink_app_id,
    ewelinkAppSecret: s.ewelink_app_secret,
    alertType: s.alert_type,
    monitoringEnabled: s.monitoring_enabled === 1,
    intervalSeconds: s.interval_seconds,
  });
});

router.put("/settings", (req, res) => {
  const { ewelinkAppId, ewelinkAppSecret, alertType, monitoringEnabled, intervalSeconds } = req.body;
  if (intervalSeconds !== undefined && (isNaN(intervalSeconds) || intervalSeconds < 10)) {
    return res.status(400).json({ error: "intervalSeconds deve ser >= 10" });
  }
  const updated = db.updateSettings({
    ewelink_app_id: ewelinkAppId ?? null,
    ewelink_app_secret: ewelinkAppSecret ?? null,
    alert_type: alertType ?? "telegram",
    monitoring_enabled: monitoringEnabled ? 1 : 0,
    interval_seconds: intervalSeconds ?? 60,
  });

  if (monitoringEnabled) {
    restartWithCurrentSettings();
  } else {
    stopMonitor();
  }

  res.json({
    ewelinkAppId: updated.ewelink_app_id,
    ewelinkAppSecret: updated.ewelink_app_secret,
    alertType: updated.alert_type,
    monitoringEnabled: updated.monitoring_enabled === 1,
    intervalSeconds: updated.interval_seconds,
  });
});

// ─── eWeLink OAuth ────────────────────────────────────────────────────────────

router.get("/ewelink/oauth/redirect-url", (req, res) => {
  res.json({ redirectUrl: REDIRECT_URL() });
});

router.get("/ewelink/oauth/url", (req, res) => {
  const region = req.query.region || "us";
  const { appId, appSecret } = ewelinkLib.getAppCredentials();
  if (!appId || !appSecret) {
    return res.status(400).json({ error: "App ID e App Secret não configurados." });
  }
  const state = crypto.randomBytes(8).toString("hex");
  const url = ewelinkLib.buildOAuthUrl(appId, appSecret, region, REDIRECT_URL(), state);
  res.json({ url });
});

router.get("/ewelink/oauth/callback", async (req, res) => {
  const { code, region, state, error } = req.query;

  if (error) {
    const msg = encodeURIComponent(String(error));
    return res.redirect(`${SERVER_URL()}/api/ewelink/oauth/done?error=${msg}`);
  }

  if (!code) {
    return res.redirect(`${SERVER_URL()}/api/ewelink/oauth/done?error=codigo_nao_recebido`);
  }

  try {
    const { appId, appSecret } = ewelinkLib.getAppCredentials();
    const detectedRegion = region || "us";
    const tokenData = await ewelinkLib.exchangeCodeForToken(
      code, detectedRegion, appId, appSecret, REDIRECT_URL()
    );

    if (tokenData.error !== 0) {
      throw new Error(tokenData.msg || "Erro ao trocar código por token");
    }

    const accessToken = tokenData.data?.accessToken;
    const refreshToken = tokenData.data?.refreshToken;

    const userInfo = await ewelinkLib.getUserInfo(accessToken, detectedRegion, appId, appSecret);
    const userEmail = userInfo.data?.email || userInfo.data?.phoneNumber || "";
    const userNickname = userInfo.data?.nickname || userInfo.data?.name || "";
    const sessionId = crypto.randomBytes(16).toString("hex");

    db.saveSession({
      session_id: sessionId,
      user_email: userEmail,
      user_nickname: userNickname,
      access_token: accessToken,
      refresh_token: refreshToken || null,
      region: detectedRegion,
      created_at: Date.now(),
    });

    const emailEnc = encodeURIComponent(userEmail);
    const nickEnc = encodeURIComponent(userNickname);
    res.redirect(
      `${SERVER_URL()}/api/ewelink/oauth/done?sessionId=${sessionId}&userEmail=${emailEnc}&userNickname=${nickEnc}`
    );
  } catch (err) {
    console.error("[OAuth] Erro no callback:", err.message);
    const msg = encodeURIComponent(err.message);
    res.redirect(`${SERVER_URL()}/api/ewelink/oauth/done?error=${msg}`);
  }
});

router.get("/ewelink/oauth/done", (req, res) => {
  const { sessionId, userEmail, userNickname, error } = req.query;
  if (error) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Erro no login</h2>
        <p>${decodeURIComponent(String(error))}</p>
        <p>Pode fechar esta janela e tentar novamente.</p>
      </body></html>
    `);
  }
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>✅ Login realizado com sucesso!</h2>
      <p>Olá, <strong>${decodeURIComponent(String(userNickname || userEmail))}</strong>!</p>
      <p>Pode fechar esta janela e voltar para o app.</p>
      <script>
        setTimeout(() => {
          window.location.href = "ewelink-monitor://oauth?sessionId=${sessionId}&userEmail=${encodeURIComponent(String(userEmail))}&userNickname=${encodeURIComponent(String(userNickname))}";
        }, 1000);
      </script>
    </body></html>
  `);
});

// ─── Verify Credentials ───────────────────────────────────────────────────────

router.get("/ewelink/verify-credentials", async (req, res) => {
  const { appId, appSecret } = ewelinkLib.getAppCredentials();
  const result = await ewelinkLib.verifyCredentials(appId, appSecret);
  res.json(result);
});

// ─── Monitor ─────────────────────────────────────────────────────────────────

router.post("/monitor/start", (req, res) => {
  const { sessionId } = req.body;
  const session = db.getSession();
  if (!session?.session_id) {
    return res.status(401).json({ error: "Sessão não encontrada." });
  }
  startMonitor(sessionId);
  res.json({ success: true });
});

router.post("/monitor/stop", (req, res) => {
  stopMonitor();
  res.json({ success: true });
});

// ─── Twilio TwiML ─────────────────────────────────────────────────────────────

router.get("/twilio/twiml", (req, res) => {
  const device = decodeURIComponent(req.query.device || "desconhecido");
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR" voice="alice">
    Atenção! O dispositivo ${device} ficou offline.
    Verifique sua conexão imediatamente.
  </Say>
  <Pause length="1"/>
  <Say language="pt-BR" voice="alice">
    Repito: O dispositivo ${device} está offline.
  </Say>
</Response>`);
});

// ─── Devices ─────────────────────────────────────────────────────────────────

router.get("/devices", async (req, res) => {
  try {
    const session = db.getSession();
    if (!session?.access_token) return res.status(401).json({ error: "Não autenticado." });
    const { appId, appSecret } = ewelinkLib.getAppCredentials();
    const devices = await ewelinkLib.getDevices(session.access_token, session.region || "us", appId, appSecret);
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
