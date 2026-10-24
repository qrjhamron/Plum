'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

process.env.LAUNCHER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'plumcraft-test-'));

const { rulesAllow, mavenPath, resolveLibraries } = require('../lib/mojang');
const { substitute, flattenArgs, normalizeClient, normalizeLoader } = require('../lib/launcher');
const { mergeLibraries, mergeVersionMeta } = require('../lib/fabric');
const { safeJoin, verifySha1 } = require('../lib/store');
const { extractZip } = require('../lib/zip');
const crypto = require('crypto');

test('rulesAllow: tanpa rules selalu boleh, OS lain ditolak', () => {
  assert.equal(rulesAllow(undefined), true);
  assert.equal(rulesAllow([{ action: 'allow', os: { name: process.platform === 'win32' ? 'osx' : 'windows' } }]), false);
  assert.equal(rulesAllow([{ action: 'allow' }]), true);
  assert.equal(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: 'linux' } }]), process.platform !== 'linux');
});

test('rulesAllow: fitur resolusi kustom', () => {
  const rules = [{ action: 'allow', features: { has_custom_resolution: true } }];
  assert.equal(rulesAllow(rules, { has_custom_resolution: true }), true);
  assert.equal(rulesAllow(rules, {}), false);
});

test('mavenPath memetakan koordinat Maven', () => {
  assert.equal(mavenPath('com.google.guava:guava:32.1.2-jre').path, 'com/google/guava/guava/32.1.2-jre/guava-32.1.2-jre.jar');
  assert.equal(mavenPath('org.lwjgl:lwjgl:3.3.2:natives-linux').path, 'org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-linux.jar');
});

test('substitute placeholder launch tidak menyisakan yang dikenal', () => {
  const out = substitute('${auth_player_name} di ${game_directory} cp=${classpath}', { auth_player_name: 'Steve', game_directory: '/tmp/g', classpath: 'a:b' });
  assert.equal(out, 'Steve di /tmp/g cp=a:b');
});

test('flattenArgs menghormati rules + value array', () => {
  const args = flattenArgs(['-x', { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: ['--demo'] }, { value: '--width ${resolution_width}' }], { is_demo_user: false }, { resolution_width: 854 });
  assert.deepEqual(args, ['-x', '--width 854']);
});

test('safeJoin menolak path traversal', () => {
  assert.throws(() => safeJoin('/tmp/base', '../escape'), /keluar/);
  assert.equal(safeJoin('/tmp/base', 'a/b'), path.resolve('/tmp/base', 'a/b'));
});

test('verifySha1 cocok & tidak cocok', async () => {
  const f = path.join(process.env.LAUNCHER_DATA_DIR, 'hello.txt');
  fs.mkdirSync(process.env.LAUNCHER_DATA_DIR, { recursive: true });
  fs.writeFileSync(f, 'halo');
  const sha = crypto.createHash('sha1').update('halo').digest('hex');
  assert.equal(await verifySha1(f, sha), true);
  assert.equal(await verifySha1(f, '0'.repeat(40)), false);
});

test('normalizeClient: CPS dibatasi 1-20 dan blok Xray tervalidasi', () => {
  const ok = normalizeClient({ autoClickCps: 12, autoClickMode: 'use', xrayBlocks: 'minecraft:diamond_ore, minecraft:iron_ore' });
  assert.equal(ok.autoClickCps, 12);
  assert.equal(ok.autoClickMode, 'use');
  assert.deepEqual(ok.xrayBlocks, ['minecraft:diamond_ore', 'minecraft:iron_ore']);
  const errors = [];
  normalizeClient({ autoClickCps: 99, xrayBlocks: ['bukan id'] }, errors);
  assert.ok(errors.some((e) => e.includes('CPS')));
  assert.ok(errors.some((e) => e.includes('Blok Xray') || e.includes('blok Xray')));
});

test('normalizeClient: X-Ray advanced dan Autoclicker advanced tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.xrayHighlight, true);
  assert.equal(dflt.xrayRadius, 16);
  assert.equal(dflt.xrayMaxHighlights, 6);
  assert.equal(dflt.autoClickTarget, 'either');
  assert.equal(dflt.autoClickCooldownSync, true);
  assert.equal(dflt.autoClickToolGuard, true);
  assert.equal(dflt.autoClickMinDurability, 5);
  assert.equal(dflt.showOreTracker, true);
  const errors = [];
  normalizeClient({ xrayRadius: 99, xrayMaxHighlights: 0, autoClickTarget: 'semua', autoClickMinDurability: 0 }, errors);
  assert.ok(errors.some((e) => e.includes('Radius highlight')));
  assert.ok(errors.some((e) => e.includes('Maks highlight')));
  assert.ok(errors.some((e) => e.includes('Target AutoClick')));
  assert.ok(errors.some((e) => e.includes('durability')));
});

test('normalizeClient: nilai custom X-Ray advanced dan Autoclicker advanced dipertahankan', () => {
  const custom = normalizeClient({
    xrayHighlight: false, xrayRadius: 24, xrayMaxHighlights: 9,
    autoClickTarget: 'block', autoClickCooldownSync: false,
    autoClickToolGuard: false, autoClickMinDurability: 17, showOreTracker: false,
  });
  assert.equal(custom.xrayHighlight, false);
  assert.equal(custom.xrayRadius, 24);
  assert.equal(custom.xrayMaxHighlights, 9);
  assert.equal(custom.autoClickTarget, 'block');
  assert.equal(custom.autoClickCooldownSync, false);
  assert.equal(custom.autoClickToolGuard, false);
  assert.equal(custom.autoClickMinDurability, 17);
  assert.equal(custom.showOreTracker, false);
});

test('normalizeClient: humanizer AutoClick default 8-14 dan tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.autoClickHumanizer, true);
  assert.equal(dflt.autoClickCpsMin, 8);
  assert.equal(dflt.autoClickCpsMax, 14);
  assert.equal(dflt.autoClickSmoothAim, true);
  assert.equal(dflt.autoClickJitter, 1.0);
  const errors = [];
  normalizeClient({ autoClickCpsMin: 0, autoClickCpsMax: 99, autoClickJitter: 5 }, errors);
  assert.ok(errors.some((e) => e.includes('Batas bawah')), 'bawah rentang divalidasi, dapat: ' + errors.join(' | '));
  assert.ok(errors.some((e) => e.includes('Batas atas')), 'atas rentang divalidasi, dapat: ' + errors.join(' | '));
  assert.ok(errors.some((e) => e.includes('Jitter')), 'jitter divalidasi');
  const swapped = [];
  normalizeClient({ autoClickCpsMin: 14, autoClickCpsMax: 8 }, swapped);
  assert.ok(swapped.some((e) => e.includes('Rentang CPS humanizer')), 'min > maks ditolak');
  const custom = normalizeClient({ autoClickHumanizer: false, autoClickCpsMin: 10, autoClickCpsMax: 12, autoClickSmoothAim: false, autoClickJitter: 0.5 });
  assert.equal(custom.autoClickHumanizer, false);
  assert.equal(custom.autoClickCpsMin, 10);
  assert.equal(custom.autoClickCpsMax, 12);
  assert.equal(custom.autoClickSmoothAim, false);
  assert.equal(custom.autoClickJitter, 0.5);
});

test('normalizeClient: toggle HUD Tambahan default aktif dan bisa dimatikan', () => {
  const dflt = normalizeClient({});
  for (const k of ['showFps', 'showCps', 'showPing', 'showCoordinates', 'showBiome', 'showCompass', 'showArmor', 'showEffects', 'showSession']) {
    assert.equal(dflt[k], true, k + ' harus default true');
  }
  const off = normalizeClient({ showPing: false, showArmor: 'false', showEffects: false });
  assert.equal(off.showPing, false);
  assert.equal(off.showArmor, false);
  assert.equal(off.showEffects, false);
  assert.equal(off.showCps, true);
});

test('normalizeClient: fitur baru AutoWeapon/AutoBow/NoFall/Stronghold/Crosshair tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.autoWeaponEnabled, false);
  assert.equal(dflt.autoBowEnabled, false);
  assert.equal(dflt.autoBowRange, 32);
  assert.equal(dflt.autoBowFullCharge, true);
  assert.equal(dflt.noFallEnabled, false);
  assert.equal(dflt.strongholdFinderEnabled, false);
  assert.equal(dflt.crosshairEnabled, false);
  assert.equal(dflt.crosshairStyle, 'cross');
  assert.equal(dflt.crosshairSize, 8);
  assert.equal(dflt.crosshairColor, 'white');
  const errors = [];
  normalizeClient({ autoBowRange: 100, crosshairStyle: 'bintang', crosshairSize: 99, crosshairColor: 'hitam' }, errors);
  assert.ok(errors.some((e) => e.includes('AutoBow')));
  assert.ok(errors.some((e) => e.includes('Crosshair')));
  assert.ok(errors.some((e) => e.includes('Ukuran Crosshair')));
  assert.ok(errors.some((e) => e.includes('Warna Crosshair')));
  const custom = normalizeClient({ autoWeaponEnabled: true, autoBowEnabled: true, autoBowRange: 48, noFallEnabled: true, strongholdFinderEnabled: true, crosshairEnabled: true, crosshairStyle: 'circle', crosshairSize: 14, crosshairColor: 'cyan' });
  assert.equal(custom.autoWeaponEnabled, true);
  assert.equal(custom.autoBowRange, 48);
  assert.equal(custom.crosshairStyle, 'circle');
  assert.equal(custom.crosshairSize, 14);
  assert.equal(custom.crosshairColor, 'cyan');
});

test('normalizeClient: ESP/Tracers/Chest/Scaffold/AutoTool/Discord tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.espEnabled, false);
  assert.equal(dflt.espRange, 64);
  assert.equal(dflt.espTargets, 'hostile');
  assert.equal(dflt.tracersEnabled, false);
  assert.equal(dflt.tracerRange, 64);
  assert.equal(dflt.chestFinderEnabled, false);
  assert.equal(dflt.chestRadius, 32);
  assert.equal(dflt.scaffoldEnabled, false);
  assert.equal(dflt.autoToolEnabled, false);
  assert.equal(dflt.discordRpcEnabled, false);
  assert.equal(dflt.discordAppId, '');
  const errors = [];
  normalizeClient({ espRange: 999, espTargets: 'semua', tracerRange: 1, chestRadius: 100, discordAppId: 'abc' }, errors);
  assert.ok(errors.some((e) => e.includes('ESP')));
  assert.ok(errors.some((e) => e.includes('Target ESP')));
  assert.ok(errors.some((e) => e.includes('Tracers')));
  assert.ok(errors.some((e) => e.includes('Chest Finder')));
  assert.ok(errors.some((e) => e.includes('Discord App ID')));
  const custom = normalizeClient({ espEnabled: true, espTargets: 'players', tracersEnabled: true, chestFinderEnabled: true, chestRadius: 48, scaffoldEnabled: true, autoToolEnabled: true, discordRpcEnabled: true, discordAppId: '123456789012345678' });
  assert.equal(custom.espTargets, 'players');
  assert.equal(custom.chestRadius, 48);
  assert.equal(custom.discordAppId, '123456789012345678');
});

test('normalizeClient: Jesus/ChestStealer/AntiFog/Chams/Triggerbot default mati dan bisa dinyalakan', () => {
  const dflt = normalizeClient({});
  for (const k of ['jesusEnabled', 'chestStealerEnabled', 'antiFogEnabled', 'chamsEnabled', 'triggerbotEnabled']) {
    assert.equal(dflt[k], false, k);
  }
  const on = normalizeClient({ jesusEnabled: true, chestStealerEnabled: true, antiFogEnabled: true, chamsEnabled: true, triggerbotEnabled: true });
  for (const k of ['jesusEnabled', 'chestStealerEnabled', 'antiFogEnabled', 'chamsEnabled', 'triggerbotEnabled']) {
    assert.equal(on[k], true, k);
  }
});

test('normalizeClient: KillAura/Velocity/Sprint/AutoArmor/Freecam default dan tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.killAuraEnabled, false);
  assert.equal(dflt.killAuraRange, 4.5);
  assert.equal(dflt.killAuraScanRange, 6);
  assert.equal(dflt.killAuraTargets, 'hostile');
  assert.equal(dflt.killAuraPriority, 'distance');
  assert.equal(dflt.killAuraMode, 'single');
  assert.equal(dflt.killAuraSwitchDelayMs, 250);
  assert.equal(dflt.killAuraFov, 120);
  assert.equal(dflt.killAuraRotationSpeed, 60);
  assert.equal(dflt.killAuraCps, 12);
  assert.equal(dflt.killAuraIgnoreInvisible, true);
  assert.equal(dflt.killAuraSmartCrit, true);
  assert.equal(dflt.killAuraRequireCooldown, true);
  assert.equal(dflt.velocityEnabled, false);
  assert.equal(dflt.velocityMode, 'reduce');
  assert.equal(dflt.velocityHorizontal, 20);
  assert.equal(dflt.velocityVertical, 100);
  assert.equal(dflt.velocityDelayTicks, 0);
  assert.equal(dflt.velocityJumpResetChance, 30);
  assert.equal(dflt.sprintEnabled, false);
  assert.equal(dflt.sprintMode, 'legit');
  assert.equal(dflt.sprintKeepSprint, true);
  assert.equal(dflt.autoArmorEnabled, false);
  assert.equal(dflt.autoArmorDelayMs, 150);
  assert.equal(dflt.freecamEnabled, false);
  assert.equal(dflt.freecamSpeed, 1.0);
  assert.equal(dflt.freecamFreeze, true);
  assert.equal(dflt.freecamShowPlayer, true);
  const errors = [];
  normalizeClient({ killAuraRange: 99, killAuraScanRange: 1, killAuraTargets: 'semua', killAuraPriority: 'acak', killAuraMode: 'semua', killAuraFov: 10, killAuraRotationSpeed: 999, killAuraCps: 0, velocityMode: 'nol', velocityHorizontal: -1, velocityVertical: 101, velocityDelayTicks: 99, velocityJumpResetChance: 0, sprintMode: 'cepat', autoArmorDelayMs: 1, freecamSpeed: 99 }, errors);
  for (const frag of ['KillAura', 'Velocity', 'Sprint', 'AutoArmor', 'Freecam']) {
    assert.ok(errors.some((e) => e.includes(frag)), frag + ' harus divalidasi, dapat: ' + errors.join(' | '));
  }
  const custom = normalizeClient({ killAuraEnabled: true, killAuraRange: 5.5, killAuraMode: 'multi', killAuraPriority: 'health', velocityEnabled: true, velocityMode: 'cancel', velocityHorizontal: 0, sprintEnabled: true, sprintMode: 'omni', autoArmorEnabled: true, autoArmorPreferElytra: true, freecamEnabled: true, freecamSpeed: 2.5, freecamFreeze: false });
  assert.equal(custom.killAuraRange, 5.5);
  assert.equal(custom.killAuraScanRange >= custom.killAuraRange, true);
  assert.equal(custom.killAuraMode, 'multi');
  assert.equal(custom.velocityMode, 'cancel');
  assert.equal(custom.sprintMode, 'omni');
  assert.equal(custom.autoArmorPreferElytra, true);
  assert.equal(custom.freecamSpeed, 2.5);
  assert.equal(custom.freecamFreeze, false);
});

test('plumclient: modul advanced KillAura/Velocity/Sprint/AutoArmor/Freecam terpasang aman', () => {
  const mod = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumClientMod.java'), 'utf8');
  const cfg = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumConfig.java'), 'utf8');
  for (const field of ['killAuraEnabled', 'velocityEnabled', 'sprintEnabled', 'autoArmorEnabled', 'freecamEnabled']) {
    assert.ok(cfg.includes(field), 'PlumConfig harus punya ' + field);
    assert.ok(mod.includes(field), 'PlumClientMod harus memakai ' + field);
  }
  assert.ok(mod.includes('attackEntity'), 'KillAura harus menyerang entity langsung');
  assert.ok(mod.includes('canSee'), 'KillAura harus cek garis pandang');
  assert.ok(mod.includes('isTeammate'), 'KillAura harus melewati rekan tim');
  assert.ok(mod.includes('getAttackCooldownProgress'), 'KillAura harus sinkron cooldown');
  assert.ok(mod.includes('handleVelocityApplied'), 'Velocity harus menangani paket velocity');
  assert.ok(mod.includes('getFoodLevel') || mod.includes('getHungerManager'), 'Sprint harus hormati lapar');
  assert.ok(mod.includes('BLINDNESS'), 'Sprint harus hormati blindness');
  assert.ok(mod.includes('armorScore'), 'AutoArmor harus menilai armor');
  assert.ok(mod.includes('EnchantmentHelper'), 'AutoArmor harus menimbang enchantment');
  assert.ok(mod.includes('currentScreen != null'), 'Modul harus berhenti saat GUI terbuka');
  const net = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/mixin/ClientPlayNetworkHandlerMixin.java'), 'utf8');
  assert.ok(net.includes('onEntityVelocityUpdate'), 'mixin jaringan harus hook velocity');
  assert.ok(net.includes('getEntityId'), 'Velocity hanya untuk paket pemain sendiri');
  const freecam = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/Freecam.java'), 'utf8');
  assert.ok(freecam.includes('applyFreeze'), 'Freecam harus bisa membekukan pemain');
  assert.ok(freecam.includes('setPerspective'), 'Freecam harus memulihkan perspektif');
  const mixins = JSON.parse(fs.readFileSync(path.join(__dirname, '../client-mod/src/main/resources/plumclient.mixins.json'), 'utf8'));
  assert.ok(mixins.client.includes('CameraMixin'), 'CameraMixin terdaftar');
  assert.ok(mixins.client.includes('EntityMixin'), 'EntityMixin terdaftar');
});

test('normalizeClient: upgrade advanced modul lama (Jesus/Xray/AutoClick/dll) default dan tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.jesusAffectWater, true);
  assert.equal(dflt.jesusAffectLava, true);
  assert.equal(dflt.jesusLift, 0.08);
  assert.equal(dflt.xrayExposedOnly, false);
  assert.equal(dflt.xrayValuableFirst, false);
  assert.equal(dflt.autoBrightGamma, 15);
  assert.equal(dflt.autoBrightFade, true);
  assert.equal(dflt.autoClickUseCpsMin, 8);
  assert.equal(dflt.autoClickUseCpsMax, 14);
  assert.equal(dflt.autoWeaponSwitchDelayMs, 150);
  assert.equal(dflt.autoWeaponEnchantWeight, true);
  assert.equal(dflt.autoBowPredictive, true);
  assert.equal(dflt.noFallMinDistance, 3);
  assert.equal(dflt.noFallIntervalMs, 100);
  assert.equal(dflt.strongholdMinSeparation, 8);
  assert.equal(dflt.crosshairDynamic, false);
  assert.equal(dflt.crosshairHitMarker, true);
  assert.equal(dflt.espShowHealth, false);
  assert.equal(dflt.tracerThickness, 2);
  assert.equal(dflt.tracerVisibleOnly, false);
  assert.equal(dflt.chestFinderTypes, 'all');
  assert.equal(dflt.scaffoldDelayMs, 100);
  assert.equal(dflt.scaffoldTower, false);
  assert.equal(dflt.autoToolSwitchDelayMs, 100);
  assert.equal(dflt.autoToolPreferSilk, false);
  assert.equal(dflt.discordShowModules, false);
  assert.equal(dflt.chestStealerDelayMs, 75);
  assert.equal(dflt.chestStealerValuableOnly, false);
  assert.equal(dflt.antiFogMode, 'full');
  assert.equal(dflt.antiFogFactor, 4);
  assert.equal(dflt.chamsTint, false);
  assert.equal(dflt.triggerbotDelayMinMs, 0);
  assert.equal(dflt.triggerbotDelayMaxMs, 80);
  assert.equal(dflt.triggerbotTargets, 'hostile');
  assert.equal(dflt.hudActiveOnly, false);
  const errors = [];
  normalizeClient({ jesusLift: 9, autoBrightGamma: 99, autoClickUseCpsMin: 0, autoClickUseCpsMax: 99, noFallMinDistance: 99, strongholdMinSeparation: 1, tracerThickness: 9, chestFinderTypes: 'acak', scaffoldDelayMs: 1, antiFogMode: 'acak', antiFogFactor: 99, triggerbotDelayMaxMs: 9999 }, errors);
  for (const frag of ['Jesus', 'AutoBright', 'NoFall', 'Stronghold', 'Tracers', 'Chest Finder', 'Scaffold', 'AntiFog', 'Triggerbot']) {
    assert.ok(errors.some((e) => e.includes(frag)), frag + ' harus divalidasi, dapat: ' + errors.join(' | '));
  }
  const mod = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumClientMod.java'), 'utf8');
  for (const frag of ['jesusLift', 'autoBrightGamma', 'autoClickUseCpsMax', 'autoWeaponSwitchDelayMs', 'autoBowPredictive', 'noFallMinDistance', 'chestStealerDelayMs', 'triggerbotDelayMaxMs']) {
    assert.ok(mod.includes(frag), 'PlumClientMod harus memakai ' + frag);
  }
});

test('normalizeClient: ClickGUI + Criticals/NoSlow/AutoTotem/Trajectories/NameTags/InvManager/AutoFish/AutoMine default dan tervalidasi', () => {
  const dflt = normalizeClient({});
  assert.equal(dflt.clickGuiEnabled, true);
  assert.equal(dflt.criticalsEnabled, false);
  assert.equal(dflt.criticalsMode, 'mini');
  assert.equal(dflt.noSlowEnabled, false);
  assert.equal(dflt.autoTotemEnabled, false);
  assert.equal(dflt.autoTotemHealth, 10);
  assert.equal(dflt.trajectoriesEnabled, false);
  assert.equal(dflt.trajectoriesSteps, 80);
  assert.equal(dflt.nameTagsEnabled, false);
  assert.equal(dflt.nameTagsRange, 64);
  assert.equal(dflt.invManagerEnabled, false);
  assert.equal(dflt.invManagerDelayMs, 200);
  assert.equal(dflt.autoFishEnabled, false);
  assert.equal(dflt.autoMineEnabled, false);
  assert.equal(dflt.autoMineOreAssist, false);
  assert.equal(dflt.entityCacheMs, 50);
  const errors = [];
  normalizeClient({ criticalsMode: 'terbang', autoTotemHealth: 99, trajectoriesSteps: 1, nameTagsRange: 999, invManagerDelayMs: 1, entityCacheMs: 9999 }, errors);
  for (const frag of ['Criticals', 'AutoTotem', 'Trajectories', 'NameTags', 'InvManager', 'entityCacheMs'.slice(0, 0) + 'Optimasi']) {
    assert.ok(errors.some((e) => e.includes(frag)), frag + ' harus divalidasi, dapat: ' + errors.join(' | '));
  }
  const mod = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumClientMod.java'), 'utf8');
  for (const frag of ['runCriticals', 'runNoSlow', 'runAutoTotem', 'runInvManager', 'runAutoFish', 'runAutoMine', 'PlumClickGuiScreen', 'EntityCache']) {
    assert.ok(mod.includes(frag), 'PlumClientMod harus memakai ' + frag);
  }
  const gui = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumClickGuiScreen.java'), 'utf8');
  assert.ok(gui.includes('extends Screen') && gui.includes('mouseClicked') && gui.includes('cfg.save()'), 'ClickGUI harus Screen interaktif yang menyimpan config');
  const cache = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/EntityCache.java'), 'utf8');
  assert.ok(cache.includes('living('), 'EntityCache harus menyediakan snapshot living entity');
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.equal(readme.toLowerCase().includes('tlauncher'), false, 'README tidak boleh mendukung TLauncher');
  for (const bad of ['bypass anticheat', 'anti-deteksi', 'evasi anticheat']) {
    assert.equal(readme.toLowerCase().includes(bad), false, 'README tidak boleh memuat: ' + bad);
  }
});

test('normalizeLoader hanya menerima vanilla/plumclient', () => {
  assert.equal(normalizeLoader({ loader: 'plumclient' }).loader, 'plumclient');
  const errors = [];
  normalizeLoader({ loader: 'forge' }, errors);
  assert.ok(errors.length > 0);
});

test('mergeLibraries: library Fabric menang atas vanilla', () => {
  const merged = mergeLibraries(
    [{ name: 'com.example:lib:1.0' }, { name: 'org.lwjgl:lwjgl:3.3.3' }],
    [{ name: 'com.example:lib:2.0' }, { name: 'net.fabricmc:fabric-loader:0.16.14' }]
  );
  assert.equal(merged.length, 3);
  assert.equal(merged.find((l) => l.name.startsWith('com.example')).name, 'com.example:lib:2.0');
});

test('mergeLibraries: classifier berbeda tidak digabung', () => {
  const merged = mergeLibraries(
    [{ name: 'org.lwjgl:lwjgl:3.3.3' }, { name: 'org.lwjgl:lwjgl:3.3.3:natives-linux' }],
    [{ name: 'org.lwjgl:lwjgl:3.3.4' }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((l) => !l.name.includes('natives')).name, 'org.lwjgl:lwjgl:3.3.4');
  assert.equal(merged.find((l) => l.name.includes('natives')).name, 'org.lwjgl:lwjgl:3.3.3:natives-linux');
});

test('mergeVersionMeta memakai mainClass Fabric dan mempertahankan unduhan vanilla', () => {
  const vanilla = { id: '1.21.4', mainClass: 'net.minecraft.client.main.Main', downloads: { client: { url: 'x' } }, libraries: [{ name: 'a:b:1' }], arguments: { game: ['--vanilla'], jvm: ['-Xvanilla'] } };
  const profile = { id: 'fabric-loader-0.16.14-1.21.4', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient', libraries: [{ name: 'a:b:2' }], arguments: { game: [], jvm: ['-Dfabric=1'] } };
  const merged = mergeVersionMeta(vanilla, profile);
  assert.equal(merged.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient');
  assert.equal(merged.downloads.client.url, 'x');
  assert.equal(merged.libraries[0].name, 'a:b:2');
  assert.ok(merged.arguments.jvm.includes('-Dfabric=1'));
});

test('resolveLibraries memakai URL Maven milik library (Fabric)', () => {
  const libs = resolveLibraries({ libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.14', url: 'https://maven.fabricmc.net/' }] });
  assert.equal(libs[0].url, 'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.16.14/fabric-loader-0.16.14.jar');
});

test('extractZip mengekstrak natives dan melewati META-INF', () => {
  // Bangun zip "stored" minimal secara manual
  const name = 'libtest.so'; const data = Buffer.from('ELF-palsu');
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const body = Buffer.concat([local, Buffer.from(name), data]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(body.length, 16);
  const zipFile = path.join(process.env.LAUNCHER_DATA_DIR, 'natives.zip');
  fs.writeFileSync(zipFile, Buffer.concat([body, central, Buffer.from(name), eocd]));
  const dest = path.join(process.env.LAUNCHER_DATA_DIR, 'natives-out');
  const out = extractZip(zipFile, dest);
  assert.deepEqual(out, [name]);
  assert.equal(fs.readFileSync(path.join(dest, name), 'utf8'), 'ELF-palsu');
  void zlib;
});

test('plumclient: guard aman NoFall/AutoClick, dengan humanizer', () => {
  const mod = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/PlumClientMod.java'), 'utf8');
  assert.ok(mod.includes('getAbilities().flying'), 'NoFall harus mati saat flying');
  assert.ok(mod.includes('isGliding()'), 'NoFall harus mati saat elytra');
  assert.ok(mod.includes('isTouchingWater()'), 'NoFall harus mati di air');
  assert.ok(mod.includes('isInLava()'), 'NoFall harus mati di lava');
  assert.ok(mod.includes('fallDistance'), 'NoFall harus cek fallDistance');
  assert.ok(mod.includes('currentScreen != null'), 'AutoClick harus berhenti saat GUI terbuka');
  assert.ok(mod.includes('getAttackCooldownProgress'), 'AutoClick harus sinkron cooldown');
  assert.ok(mod.includes('toolHasDurability'), 'AutoClick harus cek durability');
  assert.ok(mod.includes('autoClickHumanizer'), 'AutoClick harus punya saklar humanizer');
  assert.ok(mod.includes('autoClickCpsMin') && mod.includes('autoClickCpsMax'), 'AutoClick harus punya rentang CPS acak');
  assert.ok(mod.includes('wrapDegrees'), 'Aim harus interpolasi smooth, bukan snap instan');
});

test('plumclient: Xray stabil via isSideInvisible + shouldDrawSide', () => {
  const dir = path.join(__dirname, '../client-mod/src/main/java/id/plumcraft/client/mixin');
  const cull = fs.readFileSync(path.join(dir, 'AbstractBlockStateMixin.java'), 'utf8');
  assert.ok(cull.includes('isSideInvisible'), 'mixin harus override isSideInvisible');
  assert.ok(cull.includes('xrayEnabled'), 'culling hanya saat Xray aktif');
  assert.ok(cull.includes('isXrayBlock'), 'blok non-target disembunyikan, target digambar');
  const draw = fs.readFileSync(path.join(dir, 'BlockMixin.java'), 'utf8');
  assert.ok(draw.includes('shouldDrawSide'), 'BlockMixin shouldDrawSide tetap ada');
  const mixins = JSON.parse(fs.readFileSync(path.join(__dirname, '../client-mod/src/main/resources/plumclient.mixins.json'), 'utf8'));
  assert.ok(mixins.client.includes('AbstractBlockStateMixin'), 'mixin baru terdaftar di plumclient.mixins.json');
  assert.ok(mixins.client.includes('BlockMixin'), 'BlockMixin tetap terdaftar');
});

test('plumclient: dokumen batas pakai sah, tanpa janji evasi', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  assert.ok(readme.includes('singleplayer'), 'README harus menyebut batas singleplayer');
  for (const bad of ['tanpa larangan', 'server siapapun', 'anti-deteksi', 'bypass anticheat', 'penyembunyian dari anticheat']) {
    assert.equal(readme.includes(bad), false, 'README tidak boleh memuat: ' + bad);
  }
  const fabric = fs.readFileSync(path.join(__dirname, '../client-mod/src/main/resources/fabric.mod.json'), 'utf8');
  assert.ok(fabric.includes('singleplayer'), 'fabric.mod.json harus menyebut batas singleplayer');
});
