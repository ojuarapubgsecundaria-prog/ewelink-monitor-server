const axios = require("axios");
const crypto = require("crypto-js");
const { getSession, getSettings } = require("./database");

const REGION_HOSTS = {
  us: "us-apia.coolkit.cc",
  eu: "eu-apia.coolkit.cc",
  cn: "cn-apia.coolkit.cc",
  as: "as-apia.coolkit.cc",
};

const OAUTH_REGION_URLS = {
  us: "https://c2ccdn.coolkit.cc/oauth/index.html",
  eu: "https://eu-c2ccdn.coolkit.cc/oauth/index.html",
  cn: "https://cn-c2ccdn.coolkit.cc/oauth/index.html",
  as: "https://as-c2ccdn.coolkit.cc/oauth/index.html",
};

function getAppCredentials() {
  const settings = getSettings();
  const appId = settings?.ewelink_app_id || process.env.EWELINK_APP_ID;
  const appSecret = settings?.ewelink_app_secret || process.env.EWELINK_APP_SECRET;
  return { appId, appSecret };
}

function generateSign(appSecret, timestamp, nonce) {
  const message = `${timestamp}${nonce}`;
  return crypto.HmacSHA256(message, appSecret).toString(crypto.enc.Base64);
}

function buildOAuthUrl(appId, appSecret, region, redirectUrl, state) {
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 10);
  const sign = generateSign(appSecret, timestamp, nonce);
  const base = OAUTH_REGION_URLS[region] || OAUTH_REGION_URLS.us;
  const params = new URLSearchParams({
    clientId: appId,
    redirectUrl,
    nonce,
    timestamp: String(timestamp),
    grantType: "authorization_code",
    state: state || "ewelink-monitor",
    sign,
  });
  return `${base}?${params.toString()}`;
}

async function exchangeCodeForToken(code, region, appId, appSecret, redirectUrl) {
  const host = REGION_HOSTS[region] || REGION_HOSTS.us;
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 10);
  const sign = generateSign(appSecret, timestamp, nonce);

  const response = await axios.post(
    `https://${host}/v2/user/oauth/token`,
    {
      code,
      redirectUrl,
      grantType: "authorization_code",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-CK-Appid": appId,
        "X-CK-Nonce": nonce,
        "X-CK-Timestamp": String(timestamp),
        "X-CK-Sign": sign,
      },
    }
  );
  return response.data;
}

async function getUserInfo(accessToken, region, appId, appSecret) {
  const host = REGION_HOSTS[region] || REGION_HOSTS.us;
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 10);
  const sign = generateSign(appSecret, timestamp, nonce);

  const response = await axios.get(`https://${host}/v2/user/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-CK-Appid": appId,
      "X-CK-Nonce": nonce,
      "X-CK-Timestamp": String(timestamp),
      "X-CK-Sign": sign,
    },
  });
  return response.data;
}

async function getDevices(accessToken, region, appId, appSecret) {
  const host = REGION_HOSTS[region] || REGION_HOSTS.us;
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 10);
  const sign = generateSign(appSecret, timestamp, nonce);

  const response = await axios.get(`https://${host}/v2/device/thing`, {
    params: { num: 0 },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-CK-Appid": appId,
      "X-CK-Nonce": nonce,
      "X-CK-Timestamp": String(timestamp),
      "X-CK-Sign": sign,
    },
  });

  const data = response.data;
  if (data.error !== 0) throw new Error(`eWeLink API error: ${data.msg}`);

  const thingList = data.data?.thingList || [];
  return thingList
    .filter((t) => t.itemType === 1)
    .map((t) => ({
      id: t.itemData?.deviceid,
      name: t.itemData?.name || t.itemData?.deviceid,
      online: t.itemData?.online === true,
      brand: t.itemData?.brandName || "",
      model: t.itemData?.productModel || "",
    }));
}

async function verifyCredentials(appId, appSecret) {
  if (!appId || !appSecret) return { valid: false, reason: "App ID ou Secret não configurado." };
  const region = "us";
  const host = REGION_HOSTS[region];
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 10);
  const sign = generateSign(appSecret, timestamp, nonce);
  try {
    await axios.get(`https://${host}/v2/user/profile`, {
      headers: {
        Authorization: `Bearer invalidtoken`,
        "X-CK-Appid": appId,
        "X-CK-Nonce": nonce,
        "X-CK-Timestamp": String(timestamp),
        "X-CK-Sign": sign,
      },
    });
    return { valid: true };
  } catch (err) {
    const status = err.response?.status;
    const errCode = err.response?.data?.error;
    if (status === 401 && errCode === 401) {
      return { valid: true };
    }
    if (errCode === 400 || status === 400) {
      return { valid: false, reason: "App ID ou App Secret inválido. Verifique no dev.ewelink.cc." };
    }
    return { valid: true };
  }
}

module.exports = {
  buildOAuthUrl,
  exchangeCodeForToken,
  getUserInfo,
  getDevices,
  verifyCredentials,
  getAppCredentials,
  REGION_HOSTS,
};
