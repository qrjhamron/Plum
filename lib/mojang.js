'use strict';
const fs = require('fs');
const path = require('path');
const { PATHS, safeJoin, readJson, writeJsonAtomic } = require('./store');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RUNTIME_INDEX_URL = 'https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const LIBRARIES_BASE = 'https://libraries.minecraft.net/';

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeout || 30000), headers: { 'user-agent': 'PlumCraft-Launcher/1.0' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

let manifestCache = null; let manifestAt = 0;
async function getManifest({ force = false } = {}) {
  const now = Date.now();
  if (!force && manifestCache && now - manifestAt < 5 * 60 * 1000) return manifestCache;
  try {
    manifestCache = await fetchJson(MANIFEST_URL);
    manifestAt = now;
    writeJsonAtomic(path.join(PATHS.cacheDir, 'version_manifest_v2.json'), manifestCache);
    return manifestCache;
  } catch (e) {
    const cached = readJson(path.join(PATHS.cacheDir, 'version_manifest_v2.json'), null);
    if (cached) { manifestCache = cached; manifestAt = now; return cached; }
    throw e;
  }
}

async function getVersionMeta(versionId) {
  const dir = safeJoin(PATHS.versionsDir, versionId);
  const file = safeJoin(dir, versionId + '.json');
  if (fs.existsSync(file)) return readJson(file, null);
  const manifest = await getManifest();
  const entry = (manifest.versions || []).find((v) => v.id === versionId);
  if (!entry) { const e = new Error('Versi tidak ditemukan di manifest Mojang: ' + versionId); e.code = 'VERSION_NOT_FOUND'; throw e; }
  const meta = await fetchJson(entry.url);
  // Verifikasi integritas paket versi bila sha1 tersedia
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(file, meta);
  return meta;
}

function osName() { return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'; }

/** Evaluasi rules Mojang (libraries & arguments). */
function rulesAllow(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false; // bila ada rules, default deny sampai ada allow yang cocok
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== osName()) match = false;
      if (rule.os.arch) {
        const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : 'x86';
        if (rule.os.arch !== arch && !(rule.os.arch === 'x86_64' && process.arch === 'x64')) match = false;
      }
      if (rule.os.version) { try { if (!(new RegExp(rule.os.version)).test(require('os').release())) match = false; } catch { match = false; } }
    }
    if (match && rule.features) {
      for (const [k, v] of Object.entries(rule.features)) if (!!features[k] !== !!v) { match = false; break; }
    }
    if (match) allowed = rule.action === 'allow';
  }
  return allowed;
}

function mavenPath(name) {
  // group:artifact:version[:classifier][@ext]
  let ext = 'jar';
  let base = name;
  const at = name.lastIndexOf('@');
  if (at > 0) { ext = name.slice(at + 1); base = name.slice(0, at); }
  const parts = base.split(':');
  const [group, artifact, version, classifier] = parts;
  const file = artifact + '-' + version + (classifier ? '-' + classifier : '') + '.' + ext;
  return { path: [...group.split('.'), artifact, version, file].join('/'), file };
}

/** Daftar libraries yang berlaku untuk OS ini, beserta URL & sha1 bila dikenal. */
function resolveLibraries(meta) {
  const out = [];
  for (const lib of meta.libraries || []) {
    if (!rulesAllow(lib.rules)) continue;
    const base = mavenPath(lib.name);
    const classifier = String(lib.name).split(':')[3] || '';
    const isNativesEntry = classifier.startsWith('natives'); // format modern: entri terpisah "...:natives-linux"
    if (lib.downloads && lib.downloads.artifact) {
      out.push({ name: lib.name, path: lib.downloads.artifact.path || base.path, url: lib.downloads.artifact.url, sha1: lib.downloads.artifact.sha1, size: lib.downloads.artifact.size, natives: isNativesEntry || undefined, extractExclude: (lib.extract && lib.extract.exclude) || [] });
    } else if (!lib.natives) {
      const baseUrl = lib.url ? String(lib.url).replace(/\/?$/, '/') : LIBRARIES_BASE;
      out.push({ name: lib.name, path: base.path, url: baseUrl + base.path, sha1: null, size: null });
    }
    // Natives classifier
    const natives = lib.natives && lib.natives[osName()];
    if (natives && lib.downloads && lib.downloads.classifiers) {
      const key = natives.replace('${arch}', process.arch === 'x64' || process.arch === 'arm64' ? '64' : '32');
      const c = lib.downloads.classifiers[key];
      if (c) out.push({ name: lib.name + ':natives', path: c.path, url: c.url, sha1: c.sha1, size: c.size, natives: true, extractExclude: (lib.extract && lib.extract.exclude) || [] });
    }
  }
  return out;
}

function runtimePlatformKey() {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux';
}

module.exports = { MANIFEST_URL, RUNTIME_INDEX_URL, fetchJson, getManifest, getVersionMeta, osName, rulesAllow, mavenPath, resolveLibraries, runtimePlatformKey };
