'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.LAUNCHER_DATA_DIR
  ? path.resolve(process.env.LAUNCHER_DATA_DIR)
  : path.join(ROOT, 'data');

const PATHS = {
  data: DATA_DIR,
  instancesFile: path.join(DATA_DIR, 'instances.json'),
  instancesDir: path.join(DATA_DIR, 'instances'),
  versionsDir: path.join(DATA_DIR, 'versions'),
  librariesDir: path.join(DATA_DIR, 'libraries'),
  assetsDir: path.join(DATA_DIR, 'assets'),
  runtimeDir: path.join(DATA_DIR, 'runtime'),
  cacheDir: path.join(DATA_DIR, 'cache'),
  vaultFile: path.join(DATA_DIR, 'vault.enc'),
  vaultKey: path.join(DATA_DIR, '.vault-key'),
};

function ensureDirs() {
  for (const d of [PATHS.data, PATHS.instancesDir, PATHS.versionsDir, PATHS.librariesDir,
    PATHS.assetsDir, path.join(PATHS.assetsDir, 'objects'), path.join(PATHS.assetsDir, 'indexes'),
    PATHS.runtimeDir, PATHS.cacheDir]) fs.mkdirSync(d, { recursive: true });
}

/** Guard: resolved child must stay inside base (anti path-traversal). */
function safeJoin(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const rel = path.relative(path.resolve(base), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const e = new Error('Path keluar dari direktori yang diizinkan');
    e.code = 'PATH_TRAVERSAL'; throw e;
  }
  return target;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(file);
    s.on('data', (c) => h.update(c)); s.on('end', () => resolve(h.digest('hex'))); s.on('error', reject);
  });
}
async function verifySha1(file, expected) {
  if (!expected) return fs.existsSync(file);
  if (!fs.existsSync(file)) return false;
  return (await sha1File(file)).toLowerCase() === String(expected).toLowerCase();
}

/* ---------- Encrypted token vault (AES-256-GCM, key 0600, tokens never logged) ---------- */
function vaultKey() {
  ensureDirs();
  if (fs.existsSync(PATHS.vaultKey)) return fs.readFileSync(PATHS.vaultKey);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(PATHS.vaultKey, key, { mode: 0o600 });
  try { fs.chmodSync(PATHS.vaultKey, 0o600); } catch {}
  return key;
}
function vaultSave(obj) {
  ensureDirs();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  writeJsonAtomic(PATHS.vaultFile, {
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64'),
  });
}
function vaultLoad() {
  try {
    const v = readJson(PATHS.vaultFile, null);
    if (!v) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(v.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(v.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch { return null; }
}
function vaultClear() { try { fs.unlinkSync(PATHS.vaultFile); } catch {} }

module.exports = { ROOT, DATA_DIR, PATHS, ensureDirs, safeJoin, readJson, writeJsonAtomic, sha1File, verifySha1, vaultSave, vaultLoad, vaultClear };
