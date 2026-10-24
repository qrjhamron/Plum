'use strict';
const crypto = require('crypto');
const { vaultSave, vaultLoad, vaultClear } = require('./store');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const PORT = Number(process.env.PORT || 4173);
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const SCOPE = 'XboxLive.signin offline_access';

let pending = null; // {state, verifier} — memori saja, tidak pernah ditulis ke disk/log

const b64url = (b) => Buffer.from(b).toString('base64url');
function authConfigured() { return /^[0-9a-fA-F-]{36}$/.test(CLIENT_ID); }

function startLogin() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  pending = { state, verifier, at: Date.now() };
  const q = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPE,
    code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${q}`;
}

async function postForm(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status} di ${new URL(url).hostname}`);
  return data;
}
async function postJson(url, body, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.XErr || data.error || `HTTP ${res.status} di ${new URL(url).hostname}`); e.status = res.status; e.payload = data; throw e; }
  return data;
}
async function getJson(url, token) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.errorMessage || data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function xstsError(e) {
  const xerr = e && e.payload && e.payload.XErr;
  if (String(xerr) === '2148916233') return 'Akun Microsoft ini belum punya profil Xbox. Buka xbox.com, masuk sekali untuk membuat profil, lalu coba lagi.';
  if (String(xerr) === '2148916238') return 'Akun anak memerlukan persetujuan orang tua di Xbox sebelum bisa login Minecraft.';
  if (String(xerr) === '2148916236' || String(xerr) === '2148916237') return 'Akun ini perlu verifikasi tambahan di Xbox Live.';
  return null;
}

/** Rantai penuh: MS token -> Xbox Live -> XSTS -> Minecraft -> cek lisensi -> profil. */
async function chainFromMsToken(msAccessToken) {
  const xbox = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
  });
  const uhs = xbox.DisplayClaims.xui[0].uhs;
  let xsts;
  try {
    xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbox.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
    });
  } catch (e) { throw new Error(xstsError(e) || e.message); }
  if (xsts.DisplayClaims.xui[0].uhs !== uhs) throw new Error('User hash Xbox tidak cocok.');
  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`,
  });
  const mcToken = mc.access_token;
  const expiresAt = Date.now() + Number(mc.expires_in || 86400) * 1000;
  const ent = await getJson('https://api.minecraftservices.com/entitlements/mcstore', mcToken);
  const owned = (ent.items || []).some((i) => ['product_minecraft', 'game_minecraft'].includes(i.name));
  if (!owned) { const e = new Error('Akun ini tidak memiliki Minecraft: Java Edition. Bedrock saja tidak cukup untuk launcher ini.'); e.code = 'NO_LICENSE'; throw e; }
  const profile = await getJson('https://api.minecraftservices.com/minecraft/profile', mcToken);
  return { mcToken, expiresAt, profile: { id: profile.id, name: profile.name, skins: profile.skins || [] } };
}

async function handleCallback(code, state) {
  if (!pending || pending.state !== state || Date.now() - pending.at > 10 * 60 * 1000) throw new Error('State login tidak valid atau kedaluwarsa. Ulangi login.');
  const { verifier } = pending; pending = null;
  const tok = await postForm('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    client_id: CLIENT_ID, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code_verifier: verifier, scope: SCOPE,
  });
  const result = await chainFromMsToken(tok.access_token);
  vaultSave({
    refreshToken: tok.refresh_token || null, mcToken: result.mcToken, mcExpiresAt: result.expiresAt,
    profile: result.profile, savedAt: Date.now(),
  });
  return result.profile;
}

/** Profil aktif; refresh senyap bila token Minecraft kedaluwarsa. Token tidak pernah dikembalikan ke UI. */
async function currentSession() {
  const v = vaultLoad();
  if (!v) return null;
  if (v.mcToken && v.mcExpiresAt > Date.now() + 60000) return { profile: v.profile, expiresAt: v.mcExpiresAt };
  if (!v.refreshToken) { vaultClear(); return null; }
  try {
    const tok = await postForm('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      client_id: CLIENT_ID, refresh_token: v.refreshToken, grant_type: 'refresh_token', scope: SCOPE,
    });
    const result = await chainFromMsToken(tok.access_token);
    vaultSave({ refreshToken: tok.refresh_token || v.refreshToken, mcToken: result.mcToken, mcExpiresAt: result.expiresAt, profile: result.profile, savedAt: Date.now() });
    return { profile: result.profile, expiresAt: result.expiresAt };
  } catch { vaultClear(); return null; }
}

function accessForLaunch() {
  const v = vaultLoad();
  if (!v || !v.mcToken || v.mcExpiresAt <= Date.now()) return null;
  return { token: v.mcToken, profile: v.profile };
}
function logout() { vaultClear(); }

module.exports = { CLIENT_ID, REDIRECT_URI, authConfigured, startLogin, handleCallback, currentSession, accessForLaunch, logout };
