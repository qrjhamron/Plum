'use strict';
const fs = require('fs');
const path = require('path');
const { PATHS, readJson, writeJsonAtomic } = require('./store');
const { fetchJson } = require('./mojang');

const FABRIC_META = 'https://meta.fabricmc.net/v2';

/** Kunci dedupe library: group:artifact[:classifier][@ext] tanpa versi. Loader menang atas vanilla. */
function libraryKey(lib) {
  const raw = String((lib && lib.name) || '');
  const at = raw.lastIndexOf('@');
  const base = at > 0 ? raw.slice(0, at) : raw;
  const ext = at > 0 ? raw.slice(at + 1) : '';
  const parts = base.split(':');
  if (parts.length < 3) return raw;
  const key = [parts[0], parts[1], parts[3] || ''].join(':');
  return ext ? key + '@' + ext : key;
}

function mergeLibraries(vanillaLibs = [], loaderLibs = []) {
  const byKey = new Map();
  for (const lib of vanillaLibs) byKey.set(libraryKey(lib), lib);
  for (const lib of loaderLibs) byKey.set(libraryKey(lib), lib);
  return [...byKey.values()];
}

function mergeArguments(vanillaArgs, loaderArgs) {
  if (!loaderArgs) return vanillaArgs;
  if (!vanillaArgs) return loaderArgs;
  return {
    game: [...(vanillaArgs.game || []), ...(loaderArgs.game || [])],
    jvm: [...(loaderArgs.jvm || []), ...(vanillaArgs.jvm || [])],
  };
}

/** Meta efektif: vanilla Mojang + profil Fabric (mainClass/libraries/arguments dari loader). */
function mergeVersionMeta(vanillaMeta, loaderProfile) {
  if (!loaderProfile) return vanillaMeta;
  if (loaderProfile.minecraftArguments && !loaderProfile.arguments) {
    throw new Error('Profil Fabric lama (minecraftArguments) belum didukung. Pakai versi Minecraft modern.');
  }
  return {
    ...vanillaMeta,
    id: loaderProfile.id || vanillaMeta.id,
    fabricProfileId: loaderProfile.id,
    inheritsFrom: vanillaMeta.id,
    mainClass: loaderProfile.mainClass,
    libraries: mergeLibraries(vanillaMeta.libraries || [], loaderProfile.libraries || []),
    arguments: mergeArguments(vanillaMeta.arguments, loaderProfile.arguments),
  };
}

async function latestStableLoader(gameVersion) {
  const rows = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}`);
  if (!Array.isArray(rows) || !rows.length) throw new Error('Fabric Loader tidak tersedia untuk Minecraft ' + gameVersion);
  const stable = rows.find((r) => r.loader && r.loader.stable) || rows[0];
  return stable.loader.version;
}

/** Ambil (dan cache) profil Fabric Loader untuk satu versi game. */
async function getFabricProfile(gameVersion, loaderVersion) {
  const loader = loaderVersion || (await latestStableLoader(gameVersion));
  if (!/^[0-9A-Za-z.\-+_]+$/.test(loader)) throw new Error('Versi Fabric Loader tidak valid: ' + loader);
  const cacheFile = path.join(PATHS.cacheDir, `fabric-profile-${gameVersion}-${loader}.json`);
  const cached = readJson(cacheFile, null);
  if (cached && cached.mainClass) return cached;
  const profile = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`);
  if (!profile || !profile.mainClass) throw new Error('Profil Fabric tidak valid untuk ' + gameVersion + ' / ' + loader);
  profile._loaderVersion = loader;
  fs.mkdirSync(PATHS.cacheDir, { recursive: true });
  writeJsonAtomic(cacheFile, profile);
  return profile;
}

module.exports = { FABRIC_META, libraryKey, mergeLibraries, mergeArguments, mergeVersionMeta, latestStableLoader, getFabricProfile };
