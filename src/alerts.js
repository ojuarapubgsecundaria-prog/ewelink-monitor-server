const TelegramBot = require("node-telegram-bot-api");
const twilio = require("twilio");

// ─── Telegram ─────────────────────────────────────────────────────────────────

function getTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "seu_token_aqui") return null;
  return new TelegramBot(token);
}

async function sendTelegramAlert(deviceName) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || chatId === "seu_chat_id_aqui") {
    console.warn("[Telegram] TELEGRAM_CHAT_ID não configurado, pulando alerta.");
    return;
  }
  const bot = getTelegramBot();
  if (!bot) {
    console.warn("[Telegram] Token não configurado, pulando alerta.");
    return;
  }
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const message =
    `🔴 *DISPOSITIVO OFFLINE*\n\n` +
    `📦 *Dispositivo:* ${deviceName}\n` +
    `🕐 *Hora:* ${now}\n\n` +
    `_Acesse o app eWeLink Monitor para mais detalhes._`;
  try {
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    console.log(`[Telegram] Alerta enviado para dispositivo: ${deviceName}`);
  } catch (err) {
    console.error("[Telegram] Erro ao enviar alerta:", err.message);
  }
}

// ─── Twilio (chamada telefônica) ──────────────────────────────────────────────

async function makePhoneCall(deviceName) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const toNumber = process.env.TWILIO_TO_NUMBER;

  if (
    !accountSid || accountSid === "seu_account_sid_aqui" ||
    !authToken || authToken === "seu_auth_token_aqui" ||
    !fromNumber || fromNumber === "+1234567890" ||
    !toNumber || toNumber === "+5511999999999"
  ) {
    console.warn("[Twilio] Credenciais não configuradas, pulando chamada.");
    return;
  }

  const client = twilio(accountSid, authToken);
  const serverUrl = process.env.SERVER_URL || "http://localhost:3000";
  const encodedName = encodeURIComponent(deviceName);

  try {
    await client.calls.create({
      from: fromNumber,
      to: toNumber,
      url: `${serverUrl}/api/twilio/twiml?device=${encodedName}`,
    });
    console.log(`[Twilio] Chamada iniciada para ${toNumber} - dispositivo: ${deviceName}`);
  } catch (err) {
    console.error("[Twilio] Erro ao fazer chamada:", err.message);
  }
}

// ─── Enviar todos os alertas ──────────────────────────────────────────────────

async function sendOfflineAlerts(deviceName) {
  console.log(`[Alertas] Enviando alertas para dispositivo offline: ${deviceName}`);
  await Promise.allSettled([
    sendTelegramAlert(deviceName),
    makePhoneCall(deviceName),
  ]);
}

module.exports = { sendOfflineAlerts, sendTelegramAlert, makePhoneCall };
