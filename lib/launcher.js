'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { ROOT, PATHS, safeJoin, readJson, writeJsonAtomic, verifySha1 } = require('./store');
const { getManifest, getVersionMeta, resolveLibraries, rulesAllow, fetchJson, RUNTIME_INDEX_URL, runtimePlatformKey } = require('./mojang');
const { getFabricProfile, mergeVersionMeta } = require('./fabric');
const { downloadFile, downloadMany } = require('./download');
const { extractZip } = require('./zip');

/* ---------------- Instances ---------------- */
const DEFAULTS = { ramMb: 2048, width: 854, height: 480 };
const LOADERS = ['vanilla', 'plumclient'];
const PLUMCLIENT_TARGET = '1.21.4';
const DEFAULT_XRAY_BLOCKS = [
  'minecraft:coal_ore', 'minecraft:deepslate_coal_ore', 'minecraft:iron_ore', 'minecraft:deepslate_iron_ore',
  'minecraft:copper_ore', 'minecraft:deepslate_copper_ore', 'minecraft:gold_ore', 'minecraft:deepslate_gold_ore',
  'minecraft:redstone_ore', 'minecraft:deepslate_redstone_ore', 'minecraft:lapis_ore', 'minecraft:deepslate_lapis_ore',
  'minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore', 'minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore',
  'minecraft:nether_gold_ore', 'minecraft:nether_quartz_ore', 'minecraft:ancient_debris',
];
const DEFAULT_CLIENT = { xrayEnabled: false, xrayBlocks: DEFAULT_XRAY_BLOCKS, xrayHighlight: true, xrayRadius: 16, xrayMaxHighlights: 6, autoBrightEnabled: true, autoClickEnabled: false, autoClickCps: 10, autoClickHumanizer: true, autoClickCpsMin: 8, autoClickCpsMax: 14, autoClickSmoothAim: true, autoClickJitter: 1.0, autoClickMode: 'attack', autoClickTarget: 'either', autoClickCooldownSync: true, autoClickToolGuard: true, autoClickMinDurability: 5, showOreTracker: true, hudEnabled: true, showTps: true, showFps: true, showCps: true, showPing: true, showCoordinates: true, showBiome: true, showCompass: true, showArmor: true, showEffects: true, showSession: true, autoWeaponEnabled: false, autoBowEnabled: false, autoBowRange: 32, autoBowFullCharge: true, noFallEnabled: false, strongholdFinderEnabled: false, crosshairEnabled: false, crosshairStyle: 'cross', crosshairSize: 8, crosshairColor: 'white', espEnabled: false, espRange: 64, espTargets: 'hostile', tracersEnabled: false, tracerRange: 64, tracerTargets: 'hostile', chestFinderEnabled: false, chestRadius: 32, scaffoldEnabled: false, autoToolEnabled: false, discordRpcEnabled: false, discordAppId: '', jesusEnabled: false, chestStealerEnabled: false, antiFogEnabled: false, chamsEnabled: false, triggerbotEnabled: false, killAuraEnabled: false, killAuraRange: 4.5, killAuraScanRange: 6, killAuraTargets: 'hostile', killAuraPriority: 'distance', killAuraMode: 'single', killAuraSwitchDelayMs: 250, killAuraFov: 120, killAuraRotationSpeed: 60, killAuraCps: 12, killAuraThroughWalls: false, killAuraIgnoreInvisible: true, killAuraSmartCrit: true, killAuraRequireCooldown: true, velocityEnabled: false, velocityMode: 'reduce', velocityHorizontal: 20, velocityVertical: 100, velocityDelayTicks: 0, velocityJumpReset: false, velocityJumpResetChance: 30, velocityRequireMoving: false, sprintEnabled: false, sprintMode: 'legit', sprintKeepSprint: true, sprintWhileUsing: false, autoArmorEnabled: false, autoArmorDelayMs: 150, autoArmorHotbarOnly: false, autoArmorPreferElytra: false, autoArmorDropOld: false, freecamEnabled: false, freecamSpeed: 1.0, freecamFreeze: true, freecamShowPlayer: true, jesusAffectWater: true, jesusAffectLava: true, jesusLift: 0.08, xrayExposedOnly: false, xrayValuableFirst: false, autoBrightGamma: 15, autoBrightFade: true, autoClickUseCpsMin: 8, autoClickUseCpsMax: 14, autoWeaponSwitchDelayMs: 150, autoWeaponEnchantWeight: true, autoBowPredictive: true, noFallMinDistance: 3, noFallIntervalMs: 100, strongholdMinSeparation: 8, crosshairDynamic: false, crosshairHitMarker: true, espShowHealth: false, tracerThickness: 2, tracerVisibleOnly: false, chestFinderTypes: 'all', scaffoldDelayMs: 100, scaffoldTower: false, autoToolSwitchDelayMs: 100, autoToolPreferSilk: false, discordShowModules: false, chestStealerDelayMs: 75, chestStealerValuableOnly: false, antiFogMode: 'full', antiFogFactor: 4, chamsTint: false, triggerbotDelayMinMs: 0, triggerbotDelayMaxMs: 80, triggerbotTargets: 'hostile', hudActiveOnly: false, clickGuiEnabled: true, criticalsEnabled: false, criticalsMode: 'mini', criticalsCooldownMs: 350, noSlowEnabled: false, noSlowKeepSprint: true, autoTotemEnabled: false, autoTotemHealth: 10, autoTotemDelayMs: 120, autoTotemAlways: false, trajectoriesEnabled: false, trajectoriesSteps: 80, nameTagsEnabled: false, nameTagsRange: 64, nameTagsTargets: 'hostile', nameTagsShowHealth: true, nameTagsShowDistance: true, invManagerEnabled: false, invManagerDelayMs: 200, invManagerDropDuplicates: true, invManagerSortHotbar: true, autoFishEnabled: false, autoFishRecastMs: 600, autoMineEnabled: false, autoMineOreAssist: false, autoMineScanRange: 16, entityCacheMs: 50 };

const asBool = (v, dflt) => (v === undefined || v === null || v === '' ? dflt : v === true || v === 'true' || v === 'on' || v === '1' || v === 1);
function normalizeClient(input = {}, errors = []) {
  const src = input && typeof input === 'object' ? input : {};
  let blocks = src.xrayBlocks ?? DEFAULT_CLIENT.xrayBlocks;
  if (typeof blocks === 'string') blocks = blocks.split(/[\s,]+/);
  if (!Array.isArray(blocks)) blocks = [...DEFAULT_CLIENT.xrayBlocks];
  blocks = [...new Set(blocks.map((b) => String(b).trim().toLowerCase()).filter(Boolean))].slice(0, 64);
  for (const b of blocks) if (!/^[a-z0-9_.-]+:[a-z0-9_/.-]+$/.test(b)) errors.push('ID blok Xray tidak valid: ' + b);
  const cps = Number(src.autoClickCps ?? DEFAULT_CLIENT.autoClickCps);
  if (!Number.isInteger(cps) || cps < 1 || cps > 20) errors.push('AutoClick CPS harus bilangan bulat 1-20.');
  const cpsMin = Number(src.autoClickCpsMin ?? DEFAULT_CLIENT.autoClickCpsMin);
  const cpsMax = Number(src.autoClickCpsMax ?? DEFAULT_CLIENT.autoClickCpsMax);
  if (!Number.isInteger(cpsMin) || cpsMin < 1 || cpsMin > 20) errors.push('Batas bawah CPS humanizer harus bilangan bulat 1-20.');
  if (!Number.isInteger(cpsMax) || cpsMax < 1 || cpsMax > 20) errors.push('Batas atas CPS humanizer harus bilangan bulat 1-20.');
  if (Number.isInteger(cpsMin) && Number.isInteger(cpsMax) && cpsMax < cpsMin) errors.push('Rentang CPS humanizer tidak valid (maks harus >= min).');
  const jitter = Number(src.autoClickJitter ?? DEFAULT_CLIENT.autoClickJitter);
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 3) errors.push('Jitter aim AutoClick harus angka 0-3 derajat.');
  const mode = String(src.autoClickMode || DEFAULT_CLIENT.autoClickMode);
  if (!['attack', 'use', 'both'].includes(mode)) errors.push('Mode AutoClick harus attack, use, atau both.');
  const target = String(src.autoClickTarget || DEFAULT_CLIENT.autoClickTarget);
  if (!['entity', 'block', 'either'].includes(target)) errors.push('Target AutoClick harus entity, block, atau either.');
  const radius = Number(src.xrayRadius ?? DEFAULT_CLIENT.xrayRadius);
  if (!Number.isInteger(radius) || radius < 8 || radius > 32) errors.push('Radius highlight X-Ray harus bilangan bulat 8-32.');
  const maxHighlights = Number(src.xrayMaxHighlights ?? DEFAULT_CLIENT.xrayMaxHighlights);
  if (!Number.isInteger(maxHighlights) || maxHighlights < 1 || maxHighlights > 12) errors.push('Maks highlight X-Ray harus bilangan bulat 1-12.');
  const minDurability = Number(src.autoClickMinDurability ?? DEFAULT_CLIENT.autoClickMinDurability);
  if (!Number.isInteger(minDurability) || minDurability < 1 || minDurability > 64) errors.push('Batas durability AutoClick harus bilangan bulat 1-64.');
  const bowRange = Number(src.autoBowRange ?? DEFAULT_CLIENT.autoBowRange);
  if (!Number.isInteger(bowRange) || bowRange < 8 || bowRange > 64) errors.push('Jarak AutoBow harus bilangan bulat 8-64.');
  const crossStyle = String(src.crosshairStyle || DEFAULT_CLIENT.crosshairStyle);
  if (!['cross', 'dot', 'circle', 'crossdot'].includes(crossStyle)) errors.push('Gaya Crosshair harus cross, dot, circle, atau crossdot.');
  const crossSize = Number(src.crosshairSize ?? DEFAULT_CLIENT.crosshairSize);
  if (!Number.isInteger(crossSize) || crossSize < 4 || crossSize > 20) errors.push('Ukuran Crosshair harus bilangan bulat 4-20.');
  const crossColor = String(src.crosshairColor || DEFAULT_CLIENT.crosshairColor);
  if (!['white', 'green', 'red', 'cyan', 'purple', 'yellow'].includes(crossColor)) errors.push('Warna Crosshair tidak valid.');
  const espRange = Number(src.espRange ?? DEFAULT_CLIENT.espRange);
  if (!Number.isInteger(espRange) || espRange < 8 || espRange > 128) errors.push('Jarak ESP harus bilangan bulat 8-128.');
  const espTargets = String(src.espTargets || DEFAULT_CLIENT.espTargets);
  if (!['hostile', 'players', 'all', 'creatures'].includes(espTargets)) errors.push('Target ESP harus hostile, players, all, atau creatures.');
  const tracerRange = Number(src.tracerRange ?? DEFAULT_CLIENT.tracerRange);
  if (!Number.isInteger(tracerRange) || tracerRange < 8 || tracerRange > 128) errors.push('Jarak Tracers harus bilangan bulat 8-128.');
  const tracerTargets = String(src.tracerTargets || DEFAULT_CLIENT.tracerTargets);
  if (!['hostile', 'players', 'all', 'creatures'].includes(tracerTargets)) errors.push('Target Tracers harus hostile, players, all, atau creatures.');
  const chestRadius = Number(src.chestRadius ?? DEFAULT_CLIENT.chestRadius);
  if (!Number.isInteger(chestRadius) || chestRadius < 8 || chestRadius > 64) errors.push('Radius Chest Finder harus bilangan bulat 8-64.');
  const discordAppId = src.discordAppId ? String(src.discordAppId).trim() : '';
  if (discordAppId && !/^\d{17,20}$/.test(discordAppId)) errors.push('Discord App ID harus 17-20 digit angka (atau kosongkan).');
  const killAuraRange = Number(src.killAuraRange ?? DEFAULT_CLIENT.killAuraRange);
  if (!Number.isFinite(killAuraRange) || killAuraRange < 3 || killAuraRange > 6) errors.push('Jarak serang KillAura harus angka 3-6.');
  const killAuraScanRange = Number(src.killAuraScanRange ?? DEFAULT_CLIENT.killAuraScanRange);
  if (!Number.isFinite(killAuraScanRange) || killAuraScanRange < 3 || killAuraScanRange > 12) errors.push('Jarak pindai KillAura harus angka 3-12.');
  const killAuraTargets = String(src.killAuraTargets || DEFAULT_CLIENT.killAuraTargets);
  if (!['hostile', 'players', 'all', 'creatures'].includes(killAuraTargets)) errors.push('Target KillAura harus hostile, players, all, atau creatures.');
  const killAuraPriority = String(src.killAuraPriority || DEFAULT_CLIENT.killAuraPriority);
  if (!['distance', 'health', 'angle', 'hurttime'].includes(killAuraPriority)) errors.push('Prioritas KillAura harus distance, health, angle, atau hurttime.');
  const killAuraMode = String(src.killAuraMode || DEFAULT_CLIENT.killAuraMode);
  if (!['single', 'switch', 'multi'].includes(killAuraMode)) errors.push('Mode KillAura harus single, switch, atau multi.');
  const killAuraSwitchDelayMs = Number(src.killAuraSwitchDelayMs ?? DEFAULT_CLIENT.killAuraSwitchDelayMs);
  if (!Number.isInteger(killAuraSwitchDelayMs) || killAuraSwitchDelayMs < 0 || killAuraSwitchDelayMs > 2000) errors.push('Jeda ganti target KillAura harus bilangan bulat 0-2000 ms.');
  const killAuraFov = Number(src.killAuraFov ?? DEFAULT_CLIENT.killAuraFov);
  if (!Number.isInteger(killAuraFov) || killAuraFov < 30 || killAuraFov > 360) errors.push('FOV KillAura harus bilangan bulat 30-360.');
  const killAuraRotationSpeed = Number(src.killAuraRotationSpeed ?? DEFAULT_CLIENT.killAuraRotationSpeed);
  if (!Number.isInteger(killAuraRotationSpeed) || killAuraRotationSpeed < 10 || killAuraRotationSpeed > 180) errors.push('Kecepatan rotasi KillAura harus bilangan bulat 10-180.');
  const killAuraCps = Number(src.killAuraCps ?? DEFAULT_CLIENT.killAuraCps);
  if (!Number.isInteger(killAuraCps) || killAuraCps < 1 || killAuraCps > 20) errors.push('KillAura CPS harus bilangan bulat 1-20.');
  const velocityMode = String(src.velocityMode || DEFAULT_CLIENT.velocityMode);
  if (!['reduce', 'cancel'].includes(velocityMode)) errors.push('Mode Velocity harus reduce atau cancel.');
  const velocityHorizontal = Number(src.velocityHorizontal ?? DEFAULT_CLIENT.velocityHorizontal);
  if (!Number.isInteger(velocityHorizontal) || velocityHorizontal < 0 || velocityHorizontal > 100) errors.push('Persen horizontal Velocity harus bilangan bulat 0-100.');
  const velocityVertical = Number(src.velocityVertical ?? DEFAULT_CLIENT.velocityVertical);
  if (!Number.isInteger(velocityVertical) || velocityVertical < 0 || velocityVertical > 100) errors.push('Persen vertikal Velocity harus bilangan bulat 0-100.');
  const velocityDelayTicks = Number(src.velocityDelayTicks ?? DEFAULT_CLIENT.velocityDelayTicks);
  if (!Number.isInteger(velocityDelayTicks) || velocityDelayTicks < 0 || velocityDelayTicks > 10) errors.push('Delay Velocity harus bilangan bulat 0-10 tick.');
  const velocityJumpResetChance = Number(src.velocityJumpResetChance ?? DEFAULT_CLIENT.velocityJumpResetChance);
  if (!Number.isInteger(velocityJumpResetChance) || velocityJumpResetChance < 1 || velocityJumpResetChance > 100) errors.push('Peluang jump-reset Velocity harus bilangan bulat 1-100.');
  const sprintMode = String(src.sprintMode || DEFAULT_CLIENT.sprintMode);
  if (!['legit', 'omni'].includes(sprintMode)) errors.push('Mode Sprint harus legit atau omni.');
  const autoArmorDelayMs = Number(src.autoArmorDelayMs ?? DEFAULT_CLIENT.autoArmorDelayMs);
  if (!Number.isInteger(autoArmorDelayMs) || autoArmorDelayMs < 50 || autoArmorDelayMs > 1000) errors.push('Jeda AutoArmor harus bilangan bulat 50-1000 ms.');
  const freecamSpeed = Number(src.freecamSpeed ?? DEFAULT_CLIENT.freecamSpeed);
  if (!Number.isFinite(freecamSpeed) || freecamSpeed < 0.2 || freecamSpeed > 3) errors.push('Kecepatan Freecam harus angka 0.2-3.');
  const jesusLift = Number(src.jesusLift ?? DEFAULT_CLIENT.jesusLift);
  if (!Number.isFinite(jesusLift) || jesusLift < 0.03 || jesusLift > 0.2) errors.push('Daya angkat Jesus harus angka 0.03-0.2.');
  const autoBrightGamma = Number(src.autoBrightGamma ?? DEFAULT_CLIENT.autoBrightGamma);
  if (!Number.isFinite(autoBrightGamma) || autoBrightGamma < 1 || autoBrightGamma > 15) errors.push('Gamma AutoBright harus angka 1-15.');
  const autoClickUseCpsMin = Number(src.autoClickUseCpsMin ?? DEFAULT_CLIENT.autoClickUseCpsMin);
  const autoClickUseCpsMax = Number(src.autoClickUseCpsMax ?? DEFAULT_CLIENT.autoClickUseCpsMax);
  if (!Number.isInteger(autoClickUseCpsMin) || autoClickUseCpsMin < 1 || autoClickUseCpsMin > 20) errors.push('Batas bawah CPS Use AutoClick harus bilangan bulat 1-20.');
  if (!Number.isInteger(autoClickUseCpsMax) || autoClickUseCpsMax < 1 || autoClickUseCpsMax > 20) errors.push('Batas atas CPS Use AutoClick harus bilangan bulat 1-20.');
  if (Number.isInteger(autoClickUseCpsMin) && Number.isInteger(autoClickUseCpsMax) && autoClickUseCpsMax < autoClickUseCpsMin) errors.push('Rentang CPS Use AutoClick tidak valid (maks harus >= min).');
  const autoWeaponSwitchDelayMs = Number(src.autoWeaponSwitchDelayMs ?? DEFAULT_CLIENT.autoWeaponSwitchDelayMs);
  if (!Number.isInteger(autoWeaponSwitchDelayMs) || autoWeaponSwitchDelayMs < 0 || autoWeaponSwitchDelayMs > 1000) errors.push('Jeda ganti senjata AutoWeapon harus bilangan bulat 0-1000 ms.');
  const noFallMinDistance = Number(src.noFallMinDistance ?? DEFAULT_CLIENT.noFallMinDistance);
  if (!Number.isInteger(noFallMinDistance) || noFallMinDistance < 2 || noFallMinDistance > 12) errors.push('Jarak jatuh minimum NoFall harus bilangan bulat 2-12.');
  const noFallIntervalMs = Number(src.noFallIntervalMs ?? DEFAULT_CLIENT.noFallIntervalMs);
  if (!Number.isInteger(noFallIntervalMs) || noFallIntervalMs < 50 || noFallIntervalMs > 500) errors.push('Interval paket NoFall harus bilangan bulat 50-500 ms.');
  const strongholdMinSeparation = Number(src.strongholdMinSeparation ?? DEFAULT_CLIENT.strongholdMinSeparation);
  if (!Number.isInteger(strongholdMinSeparation) || strongholdMinSeparation < 4 || strongholdMinSeparation > 32) errors.push('Jarak minimum antar lemparan Stronghold harus bilangan bulat 4-32.');
  const tracerThickness = Number(src.tracerThickness ?? DEFAULT_CLIENT.tracerThickness);
  if (!Number.isInteger(tracerThickness) || tracerThickness < 1 || tracerThickness > 4) errors.push('Ketebalan garis Tracers harus bilangan bulat 1-4.');
  const chestFinderTypes = String(src.chestFinderTypes || DEFAULT_CLIENT.chestFinderTypes);
  if (!['all', 'chests', 'barrels', 'shulkers'].includes(chestFinderTypes)) errors.push('Tipe Chest Finder harus all, chests, barrels, atau shulkers.');
  const scaffoldDelayMs = Number(src.scaffoldDelayMs ?? DEFAULT_CLIENT.scaffoldDelayMs);
  if (!Number.isInteger(scaffoldDelayMs) || scaffoldDelayMs < 50 || scaffoldDelayMs > 500) errors.push('Jeda pasang Scaffold harus bilangan bulat 50-500 ms.');
  const autoToolSwitchDelayMs = Number(src.autoToolSwitchDelayMs ?? DEFAULT_CLIENT.autoToolSwitchDelayMs);
  if (!Number.isInteger(autoToolSwitchDelayMs) || autoToolSwitchDelayMs < 0 || autoToolSwitchDelayMs > 500) errors.push('Jeda ganti tool AutoTool harus bilangan bulat 0-500 ms.');
  const chestStealerDelayMs = Number(src.chestStealerDelayMs ?? DEFAULT_CLIENT.chestStealerDelayMs);
  if (!Number.isInteger(chestStealerDelayMs) || chestStealerDelayMs < 25 || chestStealerDelayMs > 500) errors.push('Jeda Chest Stealer harus bilangan bulat 25-500 ms.');
  const antiFogMode = String(src.antiFogMode || DEFAULT_CLIENT.antiFogMode);
  if (!['full', 'partial'].includes(antiFogMode)) errors.push('Mode AntiFog harus full atau partial.');
  const antiFogFactor = Number(src.antiFogFactor ?? DEFAULT_CLIENT.antiFogFactor);
  if (!Number.isInteger(antiFogFactor) || antiFogFactor < 2 || antiFogFactor > 10) errors.push('Faktor jarak AntiFog harus bilangan bulat 2-10.');
  const triggerbotDelayMinMs = Number(src.triggerbotDelayMinMs ?? DEFAULT_CLIENT.triggerbotDelayMinMs);
  const triggerbotDelayMaxMs = Number(src.triggerbotDelayMaxMs ?? DEFAULT_CLIENT.triggerbotDelayMaxMs);
  if (!Number.isInteger(triggerbotDelayMinMs) || triggerbotDelayMinMs < 0 || triggerbotDelayMinMs > 500) errors.push('Delay minimum Triggerbot harus bilangan bulat 0-500 ms.');
  if (!Number.isInteger(triggerbotDelayMaxMs) || triggerbotDelayMaxMs < 0 || triggerbotDelayMaxMs > 500) errors.push('Delay maksimum Triggerbot harus bilangan bulat 0-500 ms.');
  if (Number.isInteger(triggerbotDelayMinMs) && Number.isInteger(triggerbotDelayMaxMs) && triggerbotDelayMaxMs < triggerbotDelayMinMs) errors.push('Rentang delay Triggerbot tidak valid (maks harus >= min).');
  const triggerbotTargets = String(src.triggerbotTargets || DEFAULT_CLIENT.triggerbotTargets);
  if (!['hostile', 'players', 'all', 'creatures'].includes(triggerbotTargets)) errors.push('Target Triggerbot harus hostile, players, all, atau creatures.');
  const criticalsMode = String(src.criticalsMode || DEFAULT_CLIENT.criticalsMode);
  if (!['mini', 'jump'].includes(criticalsMode)) errors.push('Mode Criticals harus mini atau jump.');
  const criticalsCooldownMs = Number(src.criticalsCooldownMs ?? DEFAULT_CLIENT.criticalsCooldownMs);
  if (!Number.isInteger(criticalsCooldownMs) || criticalsCooldownMs < 100 || criticalsCooldownMs > 1000) errors.push('Cooldown Criticals harus bilangan bulat 100-1000 ms.');
  const autoTotemHealth = Number(src.autoTotemHealth ?? DEFAULT_CLIENT.autoTotemHealth);
  if (!Number.isInteger(autoTotemHealth) || autoTotemHealth < 1 || autoTotemHealth > 20) errors.push('Ambang HP AutoTotem harus bilangan bulat 1-20.');
  const autoTotemDelayMs = Number(src.autoTotemDelayMs ?? DEFAULT_CLIENT.autoTotemDelayMs);
  if (!Number.isInteger(autoTotemDelayMs) || autoTotemDelayMs < 50 || autoTotemDelayMs > 1000) errors.push('Jeda AutoTotem harus bilangan bulat 50-1000 ms.');
  const trajectoriesSteps = Number(src.trajectoriesSteps ?? DEFAULT_CLIENT.trajectoriesSteps);
  if (!Number.isInteger(trajectoriesSteps) || trajectoriesSteps < 20 || trajectoriesSteps > 120) errors.push('Langkah Trajectories harus bilangan bulat 20-120.');
  const nameTagsRange = Number(src.nameTagsRange ?? DEFAULT_CLIENT.nameTagsRange);
  if (!Number.isInteger(nameTagsRange) || nameTagsRange < 8 || nameTagsRange > 128) errors.push('Jarak NameTags harus bilangan bulat 8-128.');
  const nameTagsTargets = String(src.nameTagsTargets || DEFAULT_CLIENT.nameTagsTargets);
  if (!['hostile', 'players', 'all', 'creatures'].includes(nameTagsTargets)) errors.push('Target NameTags harus hostile, players, all, atau creatures.');
  const invManagerDelayMs = Number(src.invManagerDelayMs ?? DEFAULT_CLIENT.invManagerDelayMs);
  if (!Number.isInteger(invManagerDelayMs) || invManagerDelayMs < 50 || invManagerDelayMs > 1000) errors.push('Jeda InvManager harus bilangan bulat 50-1000 ms.');
  const autoFishRecastMs = Number(src.autoFishRecastMs ?? DEFAULT_CLIENT.autoFishRecastMs);
  if (!Number.isInteger(autoFishRecastMs) || autoFishRecastMs < 200 || autoFishRecastMs > 2000) errors.push('Jeda lempar ulang AutoFish harus bilangan bulat 200-2000 ms.');
  const autoMineScanRange = Number(src.autoMineScanRange ?? DEFAULT_CLIENT.autoMineScanRange);
  if (!Number.isInteger(autoMineScanRange) || autoMineScanRange < 4 || autoMineScanRange > 32) errors.push('Jarak pindai ore AutoMine harus bilangan bulat 4-32.');
  const entityCacheMs = Number(src.entityCacheMs ?? DEFAULT_CLIENT.entityCacheMs);
  if (!Number.isInteger(entityCacheMs) || entityCacheMs < 25 || entityCacheMs > 250) errors.push('Interval cache Optimasi harus bilangan bulat 25-250 ms.');
  return {
    xrayEnabled: asBool(src.xrayEnabled, DEFAULT_CLIENT.xrayEnabled),
    xrayBlocks: blocks.length ? blocks : [...DEFAULT_CLIENT.xrayBlocks],
    xrayHighlight: asBool(src.xrayHighlight, DEFAULT_CLIENT.xrayHighlight),
    xrayRadius: Number.isInteger(radius) ? radius : DEFAULT_CLIENT.xrayRadius,
    xrayMaxHighlights: Number.isInteger(maxHighlights) ? maxHighlights : DEFAULT_CLIENT.xrayMaxHighlights,
    autoBrightEnabled: asBool(src.autoBrightEnabled, DEFAULT_CLIENT.autoBrightEnabled),
    autoClickEnabled: asBool(src.autoClickEnabled, DEFAULT_CLIENT.autoClickEnabled),
    autoClickCps: Number.isInteger(cps) ? cps : DEFAULT_CLIENT.autoClickCps,
    autoClickHumanizer: asBool(src.autoClickHumanizer, DEFAULT_CLIENT.autoClickHumanizer),
    autoClickCpsMin: Number.isInteger(cpsMin) ? cpsMin : DEFAULT_CLIENT.autoClickCpsMin,
    autoClickCpsMax: Number.isInteger(cpsMax) ? cpsMax : DEFAULT_CLIENT.autoClickCpsMax,
    autoClickSmoothAim: asBool(src.autoClickSmoothAim, DEFAULT_CLIENT.autoClickSmoothAim),
    autoClickJitter: Number.isFinite(jitter) ? jitter : DEFAULT_CLIENT.autoClickJitter,
    autoClickMode: ['attack', 'use', 'both'].includes(mode) ? mode : 'attack',
    autoClickTarget: ['entity', 'block', 'either'].includes(target) ? target : 'either',
    autoClickCooldownSync: asBool(src.autoClickCooldownSync, DEFAULT_CLIENT.autoClickCooldownSync),
    autoClickToolGuard: asBool(src.autoClickToolGuard, DEFAULT_CLIENT.autoClickToolGuard),
    autoClickMinDurability: Number.isInteger(minDurability) ? minDurability : DEFAULT_CLIENT.autoClickMinDurability,
    showOreTracker: asBool(src.showOreTracker, DEFAULT_CLIENT.showOreTracker),
    hudEnabled: asBool(src.hudEnabled, DEFAULT_CLIENT.hudEnabled),
    showTps: asBool(src.showTps, DEFAULT_CLIENT.showTps),
    showFps: asBool(src.showFps, DEFAULT_CLIENT.showFps),
    showCps: asBool(src.showCps, DEFAULT_CLIENT.showCps),
    showPing: asBool(src.showPing, DEFAULT_CLIENT.showPing),
    showCoordinates: asBool(src.showCoordinates, DEFAULT_CLIENT.showCoordinates),
    showBiome: asBool(src.showBiome, DEFAULT_CLIENT.showBiome),
    showCompass: asBool(src.showCompass, DEFAULT_CLIENT.showCompass),
    showArmor: asBool(src.showArmor, DEFAULT_CLIENT.showArmor),
    showEffects: asBool(src.showEffects, DEFAULT_CLIENT.showEffects),
    showSession: asBool(src.showSession, DEFAULT_CLIENT.showSession),
    autoWeaponEnabled: asBool(src.autoWeaponEnabled, DEFAULT_CLIENT.autoWeaponEnabled),
    autoBowEnabled: asBool(src.autoBowEnabled, DEFAULT_CLIENT.autoBowEnabled),
    autoBowRange: Number.isInteger(bowRange) ? bowRange : DEFAULT_CLIENT.autoBowRange,
    autoBowFullCharge: asBool(src.autoBowFullCharge, DEFAULT_CLIENT.autoBowFullCharge),
    noFallEnabled: asBool(src.noFallEnabled, DEFAULT_CLIENT.noFallEnabled),
    strongholdFinderEnabled: asBool(src.strongholdFinderEnabled, DEFAULT_CLIENT.strongholdFinderEnabled),
    crosshairEnabled: asBool(src.crosshairEnabled, DEFAULT_CLIENT.crosshairEnabled),
    crosshairStyle: ['cross', 'dot', 'circle', 'crossdot'].includes(crossStyle) ? crossStyle : 'cross',
    crosshairSize: Number.isInteger(crossSize) ? crossSize : DEFAULT_CLIENT.crosshairSize,
    crosshairColor: ['white', 'green', 'red', 'cyan', 'purple', 'yellow'].includes(crossColor) ? crossColor : 'white',
    espEnabled: asBool(src.espEnabled, DEFAULT_CLIENT.espEnabled),
    espRange: Number.isInteger(espRange) ? espRange : DEFAULT_CLIENT.espRange,
    espTargets: ['hostile', 'players', 'all', 'creatures'].includes(espTargets) ? espTargets : 'hostile',
    tracersEnabled: asBool(src.tracersEnabled, DEFAULT_CLIENT.tracersEnabled),
    tracerRange: Number.isInteger(tracerRange) ? tracerRange : DEFAULT_CLIENT.tracerRange,
    tracerTargets: ['hostile', 'players', 'all', 'creatures'].includes(tracerTargets) ? tracerTargets : 'hostile',
    chestFinderEnabled: asBool(src.chestFinderEnabled, DEFAULT_CLIENT.chestFinderEnabled),
    chestRadius: Number.isInteger(chestRadius) ? chestRadius : DEFAULT_CLIENT.chestRadius,
    scaffoldEnabled: asBool(src.scaffoldEnabled, DEFAULT_CLIENT.scaffoldEnabled),
    autoToolEnabled: asBool(src.autoToolEnabled, DEFAULT_CLIENT.autoToolEnabled),
    discordRpcEnabled: asBool(src.discordRpcEnabled, DEFAULT_CLIENT.discordRpcEnabled),
    discordAppId,
    jesusEnabled: asBool(src.jesusEnabled, DEFAULT_CLIENT.jesusEnabled),
    chestStealerEnabled: asBool(src.chestStealerEnabled, DEFAULT_CLIENT.chestStealerEnabled),
    antiFogEnabled: asBool(src.antiFogEnabled, DEFAULT_CLIENT.antiFogEnabled),
    chamsEnabled: asBool(src.chamsEnabled, DEFAULT_CLIENT.chamsEnabled),
    triggerbotEnabled: asBool(src.triggerbotEnabled, DEFAULT_CLIENT.triggerbotEnabled),
    killAuraEnabled: asBool(src.killAuraEnabled, DEFAULT_CLIENT.killAuraEnabled),
    killAuraRange: Number.isFinite(killAuraRange) ? killAuraRange : DEFAULT_CLIENT.killAuraRange,
    killAuraScanRange: Number.isFinite(killAuraScanRange) ? Math.max(killAuraScanRange, Number.isFinite(killAuraRange) ? killAuraRange : DEFAULT_CLIENT.killAuraRange) : DEFAULT_CLIENT.killAuraScanRange,
    killAuraTargets: ['hostile', 'players', 'all', 'creatures'].includes(killAuraTargets) ? killAuraTargets : 'hostile',
    killAuraPriority: ['distance', 'health', 'angle', 'hurttime'].includes(killAuraPriority) ? killAuraPriority : 'distance',
    killAuraMode: ['single', 'switch', 'multi'].includes(killAuraMode) ? killAuraMode : 'single',
    killAuraSwitchDelayMs: Number.isInteger(killAuraSwitchDelayMs) ? killAuraSwitchDelayMs : DEFAULT_CLIENT.killAuraSwitchDelayMs,
    killAuraFov: Number.isInteger(killAuraFov) ? killAuraFov : DEFAULT_CLIENT.killAuraFov,
    killAuraRotationSpeed: Number.isInteger(killAuraRotationSpeed) ? killAuraRotationSpeed : DEFAULT_CLIENT.killAuraRotationSpeed,
    killAuraCps: Number.isInteger(killAuraCps) ? killAuraCps : DEFAULT_CLIENT.killAuraCps,
    killAuraThroughWalls: asBool(src.killAuraThroughWalls, DEFAULT_CLIENT.killAuraThroughWalls),
    killAuraIgnoreInvisible: asBool(src.killAuraIgnoreInvisible, DEFAULT_CLIENT.killAuraIgnoreInvisible),
    killAuraSmartCrit: asBool(src.killAuraSmartCrit, DEFAULT_CLIENT.killAuraSmartCrit),
    killAuraRequireCooldown: asBool(src.killAuraRequireCooldown, DEFAULT_CLIENT.killAuraRequireCooldown),
    velocityEnabled: asBool(src.velocityEnabled, DEFAULT_CLIENT.velocityEnabled),
    velocityMode: ['reduce', 'cancel'].includes(velocityMode) ? velocityMode : 'reduce',
    velocityHorizontal: Number.isInteger(velocityHorizontal) ? velocityHorizontal : DEFAULT_CLIENT.velocityHorizontal,
    velocityVertical: Number.isInteger(velocityVertical) ? velocityVertical : DEFAULT_CLIENT.velocityVertical,
    velocityDelayTicks: Number.isInteger(velocityDelayTicks) ? velocityDelayTicks : DEFAULT_CLIENT.velocityDelayTicks,
    velocityJumpReset: asBool(src.velocityJumpReset, DEFAULT_CLIENT.velocityJumpReset),
    velocityJumpResetChance: Number.isInteger(velocityJumpResetChance) ? velocityJumpResetChance : DEFAULT_CLIENT.velocityJumpResetChance,
    velocityRequireMoving: asBool(src.velocityRequireMoving, DEFAULT_CLIENT.velocityRequireMoving),
    sprintEnabled: asBool(src.sprintEnabled, DEFAULT_CLIENT.sprintEnabled),
    sprintMode: ['legit', 'omni'].includes(sprintMode) ? sprintMode : 'legit',
    sprintKeepSprint: asBool(src.sprintKeepSprint, DEFAULT_CLIENT.sprintKeepSprint),
    sprintWhileUsing: asBool(src.sprintWhileUsing, DEFAULT_CLIENT.sprintWhileUsing),
    autoArmorEnabled: asBool(src.autoArmorEnabled, DEFAULT_CLIENT.autoArmorEnabled),
    autoArmorDelayMs: Number.isInteger(autoArmorDelayMs) ? autoArmorDelayMs : DEFAULT_CLIENT.autoArmorDelayMs,
    autoArmorHotbarOnly: asBool(src.autoArmorHotbarOnly, DEFAULT_CLIENT.autoArmorHotbarOnly),
    autoArmorPreferElytra: asBool(src.autoArmorPreferElytra, DEFAULT_CLIENT.autoArmorPreferElytra),
    autoArmorDropOld: asBool(src.autoArmorDropOld, DEFAULT_CLIENT.autoArmorDropOld),
    freecamEnabled: asBool(src.freecamEnabled, DEFAULT_CLIENT.freecamEnabled),
    freecamSpeed: Number.isFinite(freecamSpeed) ? freecamSpeed : DEFAULT_CLIENT.freecamSpeed,
    freecamFreeze: asBool(src.freecamFreeze, DEFAULT_CLIENT.freecamFreeze),
    freecamShowPlayer: asBool(src.freecamShowPlayer, DEFAULT_CLIENT.freecamShowPlayer),
    jesusAffectWater: asBool(src.jesusAffectWater, DEFAULT_CLIENT.jesusAffectWater),
    jesusAffectLava: asBool(src.jesusAffectLava, DEFAULT_CLIENT.jesusAffectLava),
    jesusLift: Number.isFinite(jesusLift) ? jesusLift : DEFAULT_CLIENT.jesusLift,
    xrayExposedOnly: asBool(src.xrayExposedOnly, DEFAULT_CLIENT.xrayExposedOnly),
    xrayValuableFirst: asBool(src.xrayValuableFirst, DEFAULT_CLIENT.xrayValuableFirst),
    autoBrightGamma: Number.isFinite(autoBrightGamma) ? autoBrightGamma : DEFAULT_CLIENT.autoBrightGamma,
    autoBrightFade: asBool(src.autoBrightFade, DEFAULT_CLIENT.autoBrightFade),
    autoClickUseCpsMin: Number.isInteger(autoClickUseCpsMin) ? autoClickUseCpsMin : DEFAULT_CLIENT.autoClickUseCpsMin,
    autoClickUseCpsMax: Number.isInteger(autoClickUseCpsMax) ? autoClickUseCpsMax : DEFAULT_CLIENT.autoClickUseCpsMax,
    autoWeaponSwitchDelayMs: Number.isInteger(autoWeaponSwitchDelayMs) ? autoWeaponSwitchDelayMs : DEFAULT_CLIENT.autoWeaponSwitchDelayMs,
    autoWeaponEnchantWeight: asBool(src.autoWeaponEnchantWeight, DEFAULT_CLIENT.autoWeaponEnchantWeight),
    autoBowPredictive: asBool(src.autoBowPredictive, DEFAULT_CLIENT.autoBowPredictive),
    noFallMinDistance: Number.isInteger(noFallMinDistance) ? noFallMinDistance : DEFAULT_CLIENT.noFallMinDistance,
    noFallIntervalMs: Number.isInteger(noFallIntervalMs) ? noFallIntervalMs : DEFAULT_CLIENT.noFallIntervalMs,
    strongholdMinSeparation: Number.isInteger(strongholdMinSeparation) ? strongholdMinSeparation : DEFAULT_CLIENT.strongholdMinSeparation,
    crosshairDynamic: asBool(src.crosshairDynamic, DEFAULT_CLIENT.crosshairDynamic),
    crosshairHitMarker: asBool(src.crosshairHitMarker, DEFAULT_CLIENT.crosshairHitMarker),
    espShowHealth: asBool(src.espShowHealth, DEFAULT_CLIENT.espShowHealth),
    tracerThickness: Number.isInteger(tracerThickness) ? tracerThickness : DEFAULT_CLIENT.tracerThickness,
    tracerVisibleOnly: asBool(src.tracerVisibleOnly, DEFAULT_CLIENT.tracerVisibleOnly),
    chestFinderTypes: ['all', 'chests', 'barrels', 'shulkers'].includes(chestFinderTypes) ? chestFinderTypes : 'all',
    scaffoldDelayMs: Number.isInteger(scaffoldDelayMs) ? scaffoldDelayMs : DEFAULT_CLIENT.scaffoldDelayMs,
    scaffoldTower: asBool(src.scaffoldTower, DEFAULT_CLIENT.scaffoldTower),
    autoToolSwitchDelayMs: Number.isInteger(autoToolSwitchDelayMs) ? autoToolSwitchDelayMs : DEFAULT_CLIENT.autoToolSwitchDelayMs,
    autoToolPreferSilk: asBool(src.autoToolPreferSilk, DEFAULT_CLIENT.autoToolPreferSilk),
    discordShowModules: asBool(src.discordShowModules, DEFAULT_CLIENT.discordShowModules),
    chestStealerDelayMs: Number.isInteger(chestStealerDelayMs) ? chestStealerDelayMs : DEFAULT_CLIENT.chestStealerDelayMs,
    chestStealerValuableOnly: asBool(src.chestStealerValuableOnly, DEFAULT_CLIENT.chestStealerValuableOnly),
    antiFogMode: ['full', 'partial'].includes(antiFogMode) ? antiFogMode : 'full',
    antiFogFactor: Number.isInteger(antiFogFactor) ? antiFogFactor : DEFAULT_CLIENT.antiFogFactor,
    chamsTint: asBool(src.chamsTint, DEFAULT_CLIENT.chamsTint),
    triggerbotDelayMinMs: Number.isInteger(triggerbotDelayMinMs) ? triggerbotDelayMinMs : DEFAULT_CLIENT.triggerbotDelayMinMs,
    triggerbotDelayMaxMs: Number.isInteger(triggerbotDelayMaxMs) ? triggerbotDelayMaxMs : DEFAULT_CLIENT.triggerbotDelayMaxMs,
    triggerbotTargets: ['hostile', 'players', 'all', 'creatures'].includes(triggerbotTargets) ? triggerbotTargets : 'hostile',
    hudActiveOnly: asBool(src.hudActiveOnly, DEFAULT_CLIENT.hudActiveOnly),
    clickGuiEnabled: asBool(src.clickGuiEnabled, DEFAULT_CLIENT.clickGuiEnabled),
    criticalsEnabled: asBool(src.criticalsEnabled, DEFAULT_CLIENT.criticalsEnabled),
    criticalsMode: ['mini', 'jump'].includes(criticalsMode) ? criticalsMode : 'mini',
    criticalsCooldownMs: Number.isInteger(criticalsCooldownMs) ? criticalsCooldownMs : DEFAULT_CLIENT.criticalsCooldownMs,
    noSlowEnabled: asBool(src.noSlowEnabled, DEFAULT_CLIENT.noSlowEnabled),
    noSlowKeepSprint: asBool(src.noSlowKeepSprint, DEFAULT_CLIENT.noSlowKeepSprint),
    autoTotemEnabled: asBool(src.autoTotemEnabled, DEFAULT_CLIENT.autoTotemEnabled),
    autoTotemHealth: Number.isInteger(autoTotemHealth) ? autoTotemHealth : DEFAULT_CLIENT.autoTotemHealth,
    autoTotemDelayMs: Number.isInteger(autoTotemDelayMs) ? autoTotemDelayMs : DEFAULT_CLIENT.autoTotemDelayMs,
    autoTotemAlways: asBool(src.autoTotemAlways, DEFAULT_CLIENT.autoTotemAlways),
    trajectoriesEnabled: asBool(src.trajectoriesEnabled, DEFAULT_CLIENT.trajectoriesEnabled),
    trajectoriesSteps: Number.isInteger(trajectoriesSteps) ? trajectoriesSteps : DEFAULT_CLIENT.trajectoriesSteps,
    nameTagsEnabled: asBool(src.nameTagsEnabled, DEFAULT_CLIENT.nameTagsEnabled),
    nameTagsRange: Number.isInteger(nameTagsRange) ? nameTagsRange : DEFAULT_CLIENT.nameTagsRange,
    nameTagsTargets: ['hostile', 'players', 'all', 'creatures'].includes(nameTagsTargets) ? nameTagsTargets : 'hostile',
    nameTagsShowHealth: asBool(src.nameTagsShowHealth, DEFAULT_CLIENT.nameTagsShowHealth),
    nameTagsShowDistance: asBool(src.nameTagsShowDistance, DEFAULT_CLIENT.nameTagsShowDistance),
    invManagerEnabled: asBool(src.invManagerEnabled, DEFAULT_CLIENT.invManagerEnabled),
    invManagerDelayMs: Number.isInteger(invManagerDelayMs) ? invManagerDelayMs : DEFAULT_CLIENT.invManagerDelayMs,
    invManagerDropDuplicates: asBool(src.invManagerDropDuplicates, DEFAULT_CLIENT.invManagerDropDuplicates),
    invManagerSortHotbar: asBool(src.invManagerSortHotbar, DEFAULT_CLIENT.invManagerSortHotbar),
    autoFishEnabled: asBool(src.autoFishEnabled, DEFAULT_CLIENT.autoFishEnabled),
    autoFishRecastMs: Number.isInteger(autoFishRecastMs) ? autoFishRecastMs : DEFAULT_CLIENT.autoFishRecastMs,
    autoMineEnabled: asBool(src.autoMineEnabled, DEFAULT_CLIENT.autoMineEnabled),
    autoMineOreAssist: asBool(src.autoMineOreAssist, DEFAULT_CLIENT.autoMineOreAssist),
    autoMineScanRange: Number.isInteger(autoMineScanRange) ? autoMineScanRange : DEFAULT_CLIENT.autoMineScanRange,
    entityCacheMs: Number.isInteger(entityCacheMs) ? entityCacheMs : DEFAULT_CLIENT.entityCacheMs,
  };
}
function normalizeLoader(input = {}, errors = []) {
  const loader = String(input.loader || 'vanilla').toLowerCase();
  if (!LOADERS.includes(loader)) errors.push('Loader harus vanilla atau plumclient.');
  let loaderVersion = input.loaderVersion ? String(input.loaderVersion).trim() : null;
  if (loaderVersion && !/^[0-9A-Za-z.\-+_]{1,32}$/.test(loaderVersion)) { errors.push('Versi Fabric Loader tidak valid.'); loaderVersion = null; }
  return { loader: LOADERS.includes(loader) ? loader : 'vanilla', loaderVersion };
}
const PLUMCLIENT_JAR_CANDIDATES = [
  path.join(ROOT, 'client-mod', 'build', 'libs', 'plumclient-1.0.0.jar'),
  path.join(ROOT, 'client', 'plumclient-1.0.0.jar'),
  path.join(ROOT, 'plumclient.jar'),
];
function findPlumClientJar() { return PLUMCLIENT_JAR_CANDIDATES.find((f) => fs.existsSync(f)) || null; }
function clientConfigPath(inst) { return safeJoin(gameDirOf(inst), 'config', 'plumclient.json'); }
function writeClientConfig(inst) {
  const file = clientConfigPath(inst);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, normalizeClient(inst.client || {}));
  return file;
}
function loadInstances() { return readJson(PATHS.instancesFile, { instances: [] }).instances; }
function saveInstances(list) { writeJsonAtomic(PATHS.instancesFile, { instances: list }); }
function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'instance'; }

function javaVersionOf(file) {
  return new Promise((resolve) => {
    if (!file || !fs.existsSync(file)) return resolve(null);
    execFile(file, ['-version'], { timeout: 10000 }, (err, stdout, stderr) => {
      const text = String(stderr || stdout || '');
      const m = text.match(/version "(?:1\.)?(\d+)/);
      resolve(m ? Number(m[1]) : null);
    });
  });
}
async function systemJavaCandidates() {
  const found = [];
  const binName = process.platform === 'win32' ? 'java.exe' : 'java';
  if (process.env.JAVA_HOME) found.push(path.join(process.env.JAVA_HOME, 'bin', binName));
  const roots = ['/usr/lib/jvm', '/opt', '/usr/local', 'C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Microsoft'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    // <root>/<jdk>/bin/java dan <root>/bin/java
    if (fs.existsSync(path.join(root, 'bin', binName))) found.push(path.join(root, 'bin', binName));
    let entries = []; try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(root, e.name, 'bin', binName);
      if (fs.existsSync(candidate)) found.push(candidate);
      const inner = path.join(root, e.name, 'Contents', 'Home', 'bin', binName); // macOS bundle
      if (fs.existsSync(inner)) found.push(inner);
    }
  }
  const pathJava = process.platform === 'win32' ? 'java.exe' : 'java';
  found.push(pathJava); // fallback PATH
  const out = [];
  for (const f of [...new Set(found)]) { const major = await javaVersionOf(f === pathJava ? f : f); if (major) out.push({ path: f, major }); }
  return out;
}

async function validateInstanceInput(input, { existingId = null } = {}) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (name.length < 1 || name.length > 40) errors.push('Nama instance wajib 1-40 karakter.');
  if (/[\\/:*?"<>|]/.test(name)) errors.push('Nama mengandung karakter terlarang: \\ / : * ? " < > |');
  const list = loadInstances();
  if (name && list.some((i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== existingId)) errors.push('Nama instance sudah dipakai.');
  let versionId = String(input.versionId || '');
  let meta = null;
  if (!versionId) errors.push('versionId wajib diisi.');
  else {
    try { const man = await getManifest(); if (!man.versions.some((v) => v.id === versionId)) errors.push('Versi tidak ada di manifest Mojang: ' + versionId); else meta = await getVersionMeta(versionId); }
    catch (e) { errors.push('Gagal memvalidasi versi: ' + e.message); }
  }
  const ramMb = Number(input.ramMb ?? DEFAULTS.ramMb);
  const maxRam = Math.max(1024, Math.floor(os.totalmem() / 1048576 * 0.8));
  if (!Number.isInteger(ramMb) || ramMb < 512 || ramMb > Math.min(32768, maxRam)) errors.push(`RAM harus bilangan bulat 512-${Math.min(32768, maxRam)} MB (80% RAM sistem).`);
  const width = Number(input.width ?? DEFAULTS.width), height = Number(input.height ?? DEFAULTS.height);
  if (!Number.isInteger(width) || width < 320 || width > 7680) errors.push('Lebar resolusi harus 320-7680.');
  if (!Number.isInteger(height) || height < 240 || height > 4320) errors.push('Tinggi resolusi harus 240-4320.');
  const requiredJava = meta && meta.javaVersion ? Number(meta.javaVersion.majorVersion || 8) : 8;
  let javaPath = input.javaPath ? String(input.javaPath) : null;
  let javaMajor = null;
  if (javaPath) {
    if (!fs.existsSync(javaPath)) errors.push('javaPath tidak ditemukan.');
    else { javaMajor = await javaVersionOf(javaPath); if (!javaMajor) errors.push('javaPath bukan Java yang bisa dijalankan.'); else if (javaMajor < requiredJava) errors.push(`Versi ini butuh Java >= ${requiredJava}, terdeteksi Java ${javaMajor}.`); }
  }
  const jvmArgs = input.jvmArgs ? String(input.jvmArgs).slice(0, 1000) : '';
  const { loader, loaderVersion } = normalizeLoader(input, errors);
  const client = normalizeClient(input.client || {}, errors);
  if (loader === 'plumclient' && versionId && versionId !== PLUMCLIENT_TARGET) errors.push(`PlumClient saat ini mendukung Minecraft ${PLUMCLIENT_TARGET}. Pilih versi itu atau pakai Vanilla.`);
  if (errors.length) { const e = new Error(errors.join(' ')); e.code = 'VALIDATION'; e.errors = errors; throw e; }
  return { name, versionId, meta, ramMb, width, height, javaPath, javaMajor, requiredJava, jvmArgs, loader, loaderVersion, client };
}

function gameDirOf(inst) { return safeJoin(PATHS.instancesDir, inst.id, 'game'); }

async function createInstance(input) {
  const v = await validateInstanceInput(input);
  let id = slug(v.name);
  const list = loadInstances();
  if (list.some((i) => i.id === id)) id = id + '-' + Date.now().toString(36);
  const inst = { id, name: v.name, versionId: v.versionId, ramMb: v.ramMb, width: v.width, height: v.height, javaPath: v.javaPath, jvmArgs: v.jvmArgs, loader: v.loader, loaderVersion: v.loaderVersion, client: v.client, createdAt: new Date().toISOString(), installed: false };
  fs.mkdirSync(gameDirOf(inst), { recursive: true });
  list.push(inst); saveInstances(list);
  return inst;
}

/* ---------------- Install ---------------- */
const jobs = new Map();
function newJob(kind, label) {
  const id = 'job-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const job = { id, kind, label, status: 'running', progress: 0, detail: '', error: null, createdAt: Date.now() };
  jobs.set(id, job); if (jobs.size > 30) jobs.delete(jobs.keys().next().value);
  return job;
}

async function provisionJava(meta, job) {
  const required = meta.javaVersion ? Number(meta.javaVersion.majorVersion || 8) : 8;
  const component = meta.javaVersion && meta.javaVersion.component;
  // 1) Java sistem yang cocok
  const sys = await systemJavaCandidates();
  const fit = sys.filter((j) => j.major >= required).sort((a, b) => a.major - b.major)[0];
  // 2) Runtime resmi Mojang
  if (component) {
    const runtimeDir = safeJoin(PATHS.runtimeDir, component);
    const binName = process.platform === 'win32' ? 'java.exe' : 'java';
    const found = [];
    const walk = (d, dep) => { if (dep < 0 || !fs.existsSync(d) || found.length) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isFile() && e.name === binName && path.basename(path.dirname(p)) === 'bin') found.push(p); else if (e.isDirectory()) walk(p, dep - 1); } };
    walk(runtimeDir, 3);
    if (found.length) { const mj = await javaVersionOf(found[0]); if (mj && mj >= required) return { java: found[0], source: 'mojang-runtime', major: mj }; }
    try {
      job.detail = 'Mengunduh Java runtime resmi Mojang (' + component + ')…';
      const index = await fetchJson(RUNTIME_INDEX_URL);
      const plat = runtimePlatformKey();
      const entry = index[plat] && index[plat][component] && index[plat][component][0];
      if (!entry) throw new Error('Runtime tidak tersedia untuk platform ' + plat);
      const manifest = await fetchJson(entry.manifest.url);
      if (entry.manifest.sha1 && !(await verifySha1(safeJoin(PATHS.cacheDir, component + '.json'), entry.manifest.sha1))) writeJsonAtomic(safeJoin(PATHS.cacheDir, component + '.json'), manifest);
      const files = Object.entries(manifest.files || {}).filter(([, f]) => f.type === 'file');
      const items = files.filter(([, f]) => f.downloads && f.downloads.raw).map(([rel, f]) => ({ url: f.downloads.raw.url, sha1: f.downloads.raw.sha1, size: f.downloads.raw.size, dest: safeJoin(runtimeDir, rel), _exec: f.executable }));
      const lzmaOnly = files.length - items.length;
      await downloadMany(items, { concurrency: 8, onProgress: (p) => { job.progress = Math.round(p.done / Math.max(1, p.total) * 100); } });
      for (const it of items) if (it._exec && process.platform !== 'win32') { try { fs.chmodSync(it.dest, 0o755); } catch {} }
      walk(runtimeDir, 3);
      if (found.length) { const mj = await javaVersionOf(found[0]); if (mj) { if (lzmaOnly) job.detail += ` (${lzmaOnly} berkas lzma dilewati)`; return { java: found[0], source: 'mojang-runtime', major: mj }; } }
      throw new Error('Binary Java runtime tidak ditemukan setelah unduh.');
    } catch (e) {
      if (fit) return { java: fit.path, source: 'system', major: fit.major, note: 'Runtime Mojang gagal (' + e.message + '), memakai Java sistem.' };
      throw new Error('Java runtime Mojang gagal diunduh dan tidak ada Java sistem >= ' + required + ': ' + e.message);
    }
  }
  if (fit) return { java: fit.path, source: 'system', major: fit.major };
  throw new Error('Butuh Java >= ' + required + '. Install Java atau biarkan launcher mengunduh runtime Mojang.');
}

/** Meta vanilla, atau vanilla+Fabric bila instance PlumClient. */
async function effectiveMeta(inst) {
  const vanilla = await getVersionMeta(inst.versionId);
  if (!inst.loader || inst.loader === 'vanilla') return vanilla;
  const profile = await getFabricProfile(inst.versionId, inst.loaderVersion || undefined);
  inst.loaderVersion = profile._loaderVersion || inst.loaderVersion;
  inst.fabricProfileId = profile.id;
  return mergeVersionMeta(vanilla, profile);
}

async function installInstance(inst, job) {
  const vanillaMeta = await getVersionMeta(inst.versionId);
  const meta = await effectiveMeta(inst);
  const setP = (p, d) => { job.progress = p; if (d) job.detail = d; };
  // Java dulu supaya gagal cepat
  const javaInfo = await provisionJava(meta, job);
  inst.javaPath = inst.javaPath || javaInfo.java;
  // Client
  setP(5, 'Mengunduh client ' + inst.versionId + '…');
  const vDir = safeJoin(PATHS.versionsDir, inst.versionId);
  const clientJar = safeJoin(vDir, inst.versionId + '.jar');
  const clientDl = meta.downloads && meta.downloads.client;
  if (!clientDl) throw new Error('Version JSON tidak punya unduhan client.');
  await downloadFile({ url: clientDl.url, sha1: clientDl.sha1, size: clientDl.size, dest: clientJar, onProgress: (d, t) => setP(5 + Math.round((d / (t || d || 1)) * 20)) });
  // Libraries + natives
  setP(25, 'Mengunduh libraries…');
  const libs = resolveLibraries(meta);
  const nativesDir = safeJoin(vDir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });
  await downloadMany(libs.map((l) => ({ url: l.url, sha1: l.sha1, size: l.size, dest: safeJoin(PATHS.librariesDir, l.path) })), {
    concurrency: 8, onProgress: (p) => setP(25 + Math.round(p.done / Math.max(1, p.total) * 30), `Libraries ${p.done}/${p.total}`),
  });
  for (const l of libs.filter((x) => x.natives)) {
    try {
      const extracted = extractZip(safeJoin(PATHS.librariesDir, l.path), nativesDir);
      for (const f of extracted) { const p = safeJoin(nativesDir, f); if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o755); } catch {} } }
    } catch {}
  }
  // Assets
  if (meta.assetIndex) {
    setP(55, 'Mengunduh asset index…');
    const idxDest = safeJoin(PATHS.assetsDir, 'indexes', meta.assetIndex.id + '.json');
    await downloadFile({ url: meta.assetIndex.url, sha1: meta.assetIndex.sha1, size: meta.assetIndex.totalSize, dest: idxDest });
    const index = readJson(idxDest, { objects: {} });
    const objects = Object.values(index.objects || {});
    setP(60, `Mengunduh ${objects.length} assets…`);
    await downloadMany(objects.map((o) => ({ url: `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`, sha1: o.hash, size: o.size, dest: safeJoin(PATHS.assetsDir, 'objects', o.hash.slice(0, 2), o.hash) })), {
      concurrency: 12, onProgress: (p) => setP(60 + Math.round(p.done / Math.max(1, p.total) * 35), `Assets ${p.done}/${p.total}`),
    });
  }
  if (inst.loader === 'plumclient') {
    setP(96, 'Memasang PlumClient (Xray, AutoBright, AutoClick, TPS)…');
    const jar = findPlumClientJar();
    if (!jar) throw new Error('JAR PlumClient belum dibangun. Build dulu: cd client-mod && gradle build (hasil: client-mod/build/libs/plumclient-1.0.0.jar).');
    const modsDir = safeJoin(gameDirOf(inst), 'mods');
    fs.mkdirSync(modsDir, { recursive: true });
    for (const old of fs.readdirSync(modsDir).filter((f) => /^plumclient.*\.jar$/i.test(f))) fs.unlinkSync(safeJoin(modsDir, old));
    fs.copyFileSync(jar, safeJoin(modsDir, 'plumclient-1.0.0.jar'));
    writeClientConfig(inst);
    inst.plumClientJar = 'plumclient-1.0.0.jar';
  }
  inst.installed = true; inst.javaSource = javaInfo.source; inst.installedAt = new Date().toISOString();
  const list = loadInstances().map((i) => (i.id === inst.id ? inst : i)); saveInstances(list);
  setP(100, 'Selesai. Java: ' + javaInfo.java + ' (' + javaInfo.source + ')');
  return { javaInfo };
}

/* ---------------- Launch ---------------- */
function substitute(text, map) { return String(text).replace(/\$\{([^}]+)\}/g, (m, k) => (map[k] !== undefined ? String(map[k]) : m)); }
function flattenArgs(list, features, map) {
  const out = [];
  for (const item of list || []) {
    if (typeof item === 'string') out.push(substitute(item, map));
    else if (item && typeof item === 'object') {
      if (!rulesAllow(item.rules, features)) continue;
      const vals = Array.isArray(item.value) ? item.value : [item.value];
      for (const v of vals) out.push(substitute(v, map));
    }
  }
  return out;
}

async function buildLaunch(inst, session) {
  const meta = await effectiveMeta(inst);
  const gameDir = gameDirOf(inst);
  const vDir = safeJoin(PATHS.versionsDir, inst.versionId);
  const nativesDir = safeJoin(vDir, 'natives');
  const clientJar = safeJoin(vDir, inst.versionId + '.jar');
  const libs = resolveLibraries(meta).filter((l) => !l.natives);
  const missing = [];
  if (!(await verifySha1(clientJar, meta.downloads && meta.downloads.client && meta.downloads.client.sha1))) missing.push('client.jar ' + inst.versionId);
  for (const l of libs) if (!(await verifySha1(safeJoin(PATHS.librariesDir, l.path), l.sha1))) missing.push(l.path);
  if (meta.assetIndex && !fs.existsSync(safeJoin(PATHS.assetsDir, 'indexes', meta.assetIndex.id + '.json'))) missing.push('asset index ' + meta.assetIndex.id);
  if (inst.loader === 'plumclient') {
    if (!fs.existsSync(safeJoin(gameDir, 'mods', 'plumclient-1.0.0.jar'))) missing.push('mods/plumclient-1.0.0.jar');
  }
  const java = inst.javaPath || (await provisionJava(meta, { detail: '' })).java;
  if (!java || !fs.existsSync(java.replace(/^java(\.exe)?$/, '')) && java !== 'java' && java !== 'java.exe') missing.push('java: ' + java);
  if (missing.length) { const e = new Error('File belum lengkap, jalankan Install dulu. Hilang: ' + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ` (+${missing.length - 8} lagi)` : '')); e.code = 'MISSING_FILES'; e.missing = missing; throw e; }
  if (inst.loader === 'plumclient') writeClientConfig(inst);
  const sep = process.platform === 'win32' ? ';' : ':';
  const classpath = [...libs.map((l) => safeJoin(PATHS.librariesDir, l.path)), clientJar].join(sep);
  const features = { is_demo_user: false, has_custom_resolution: true, has_quick_plays_support: false, is_quick_play_singleplayer: false, is_quick_play_multiplayer: false, is_quick_play_realms: false };
  const map = {
    auth_player_name: session.profile.name, version_name: inst.versionId, game_directory: gameDir,
    assets_root: PATHS.assetsDir, game_assets: PATHS.assetsDir, assets_index_name: meta.assetIndex ? meta.assetIndex.id : meta.assets || '',
    auth_uuid: session.profile.id, auth_access_token: session.token, auth_session: 'token:' + session.token,
    user_type: 'msa', version_type: meta.type || 'release', natives_directory: nativesDir,
    launcher_name: 'PlumCraft', launcher_version: '1.0.0', classpath, classpath_separator: sep,
    library_directory: PATHS.librariesDir, primary_jar: clientJar, resolution_width: inst.width, resolution_height: inst.height,
    auth_xuid: session.profile.id, clientid: '', user_properties: '{}', quickPlayPath: '',
  };
  let jvmArgs, gameArgs;
  if (meta.arguments) { jvmArgs = flattenArgs(meta.arguments.jvm, features, map); gameArgs = flattenArgs(meta.arguments.game, features, map); }
  else if (meta.minecraftArguments) {
    jvmArgs = [`-Djava.library.path=${nativesDir}`, '-cp', classpath];
    gameArgs = substitute(meta.minecraftArguments, map).split(/\s+/).filter(Boolean);
  } else throw new Error('Version JSON tidak punya arguments.');
  const extra = inst.jvmArgs ? inst.jvmArgs.split(/\s+/).filter(Boolean) : [];
  const args = [...extra, `-Xmx${inst.ramMb}M`, `-Xms${Math.min(512, inst.ramMb)}M`, ...jvmArgs, meta.mainClass, ...gameArgs];
  // Pastikan -cp & natives ada (beberapa format menaruhnya di arguments.jvm; bila belum ada, sisipkan)
  if (!args.includes('-cp') && !args.some((a) => a.startsWith('-cp'))) { const mcIdx = args.indexOf(meta.mainClass); args.splice(mcIdx, 0, '-cp', classpath); }
  if (!args.some((a) => a.startsWith('-Djava.library.path'))) { args.unshift(`-Djava.library.path=${nativesDir}`); }
  return { java, args, gameDir, classpath };
}

const running = new Map(); // instanceId -> {child, logs[]}
function launchInstance(inst, session) {
  return buildLaunch(inst, session).then(({ java, args, gameDir }) => {
    if (running.has(inst.id)) { const e = new Error('Instance ini sedang berjalan.'); e.code = 'ALREADY_RUNNING'; throw e; }
    fs.mkdirSync(gameDir, { recursive: true });
    const child = spawn(java, args, { cwd: gameDir, stdio: ['ignore', 'pipe', 'pipe'] });
    const logs = [];
    const push = (buf) => { for (const line of String(buf).split(/\r?\n/)) if (line) { logs.push(line); if (logs.length > 500) logs.shift(); } };
    child.stdout.on('data', push); child.stderr.on('data', push);
    const rec = { child, logs, startedAt: Date.now(), exitCode: null };
    child.on('exit', (code) => { rec.exitCode = code; logs.push('[launcher] Proses game berakhir, exit code ' + code); setTimeout(() => running.delete(inst.id), 60000); });
    running.set(inst.id, rec);
    // Jangan tampilkan token di log perintah
    const safeCmd = [java, ...args].join(' ').replace(session.token, '[TOKEN]');
    logs.push('[launcher] Menjalankan di ' + gameDir);
    logs.push('[launcher] ' + (safeCmd.length > 600 ? safeCmd.slice(0, 600) + '…' : safeCmd));
    return { pid: child.pid, commandPreview: safeCmd.slice(0, 600) };
  });
}

/* ---------------- Diagnostics & validation ---------------- */
async function validateInstance(inst) {
  const checks = [];
  const meta = await effectiveMeta(inst).catch((e) => { checks.push({ name: 'Version JSON', ok: false, detail: e.message }); return null; });
  const gameDir = gameDirOf(inst);
  checks.push({ name: 'Folder instance', ok: fs.existsSync(gameDir), detail: gameDir });
  if (meta) {
    const clientJar = safeJoin(PATHS.versionsDir, inst.versionId, inst.versionId + '.jar');
    checks.push({ name: 'client.jar (SHA-1)', ok: await verifySha1(clientJar, meta.downloads.client.sha1), detail: clientJar });
    const libs = resolveLibraries(meta).filter((l) => !l.natives);
    let okCount = 0; for (const l of libs) if (await verifySha1(safeJoin(PATHS.librariesDir, l.path), l.sha1)) okCount++;
    checks.push({ name: `Libraries ${okCount}/${libs.length}`, ok: okCount === libs.length, detail: PATHS.librariesDir });
    checks.push({ name: 'Asset index', ok: !meta.assetIndex || fs.existsSync(safeJoin(PATHS.assetsDir, 'indexes', meta.assetIndex.id + '.json')), detail: meta.assetIndex ? meta.assetIndex.id : '-' });
    const req = meta.javaVersion ? meta.javaVersion.majorVersion : 8;
    const java = inst.javaPath;
    const major = java ? await javaVersionOf(java) : null;
    checks.push({ name: `Java (butuh >= ${req})`, ok: !!major && major >= req, detail: java ? `${java} -> Java ${major || '?'}` : 'Belum terpasang. Jalankan Install.' });
    if (inst.loader === 'plumclient') {
      checks.push({ name: 'Fabric profile', ok: !!meta.fabricProfileId, detail: meta.fabricProfileId || 'Profil Fabric belum terpasang' });
      checks.push({ name: 'PlumClient JAR', ok: fs.existsSync(safeJoin(gameDir, 'mods', 'plumclient-1.0.0.jar')), detail: safeJoin(gameDir, 'mods', 'plumclient-1.0.0.jar') });
      let cfgOk = false; try { const raw = readJson(clientConfigPath(inst), null); if (raw) { const c = normalizeClient(raw); cfgOk = c.autoClickCps >= 1 && c.autoClickCps <= 20 && c.autoClickCpsMin >= 1 && c.autoClickCpsMin <= 20 && c.autoClickCpsMax >= c.autoClickCpsMin && c.autoClickCpsMax <= 20 && c.autoClickJitter >= 0 && c.autoClickJitter <= 3 && c.xrayRadius >= 8 && c.xrayRadius <= 32 && c.xrayMaxHighlights >= 1 && c.xrayMaxHighlights <= 12 && c.autoClickMinDurability >= 1 && c.autoClickMinDurability <= 64 && Array.isArray(c.xrayBlocks); } } catch {}
      checks.push({ name: 'Config PlumClient (Xray/AutoBright/AutoClick/TPS)', ok: cfgOk, detail: clientConfigPath(inst) });
    }
  }
  return { instanceId: inst.id, ok: checks.every((c) => c.ok), checks };
}

function importInstanceSync(sourcePath, inst) {
  const src = path.resolve(String(sourcePath));
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) { const e = new Error('Folder sumber .minecraft tidak ditemukan.'); e.code = 'VALIDATION'; throw e; }
  const markers = ['versions', 'saves', 'mods', 'resourcepacks', 'options.txt', 'launcher_profiles.json'];
  if (!markers.some((m) => fs.existsSync(path.join(src, m)))) { const e = new Error('Folder sumber tidak terlihat seperti .minecraft (tidak ada versions/saves/mods/options.txt).'); e.code = 'VALIDATION'; throw e; }
  const dest = gameDirOf(inst);
  let copied = 0, skipped = 0;
  const copy = (s, d) => {
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, e.name), dp = safeJoin(dest, path.relative(dest, path.join(d, e.name)));
      if (e.isSymbolicLink()) { skipped++; continue; }
      if (e.isDirectory()) { fs.mkdirSync(dp, { recursive: true }); copy(sp, dp); }
      else { fs.mkdirSync(path.dirname(dp), { recursive: true }); fs.copyFileSync(sp, dp); copied++; }
    }
  };
  copy(src, dest);
  return { copied, skippedSymlinks: skipped, dest };
}

module.exports = { DEFAULTS, DEFAULT_CLIENT, PLUMCLIENT_TARGET, LOADERS, normalizeClient, normalizeLoader, findPlumClientJar, clientConfigPath, writeClientConfig, effectiveMeta, loadInstances, saveInstances, slug, javaVersionOf, systemJavaCandidates, validateInstanceInput, gameDirOf, createInstance, jobs, newJob, provisionJava, installInstance, substitute, flattenArgs, buildLaunch, launchInstance, running, validateInstance, importInstanceSync };
