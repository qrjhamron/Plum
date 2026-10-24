'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Di jendela Tauri UI dimuat dari aset aplikasi, jadi API engine lokal dipanggil absolut.
// Tidak ada lagi UI lewat browser: engine hanya API internal untuk aplikasi desktop.
const API_BASE = location.port === '4173' ? '' : 'http://127.0.0.1:4173';
async function openExternal(url) {
  if (window.__TAURI__ && window.__TAURI__.core) { await window.__TAURI__.core.invoke('open_external', { url }); return; }
  location.href = url;
}
async function api(path, opts = {}) {
  const r = await fetch(API_BASE + path, { headers: { 'content-type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || ('HTTP ' + r.status)), data);
  return data;
}
const XRAY_PRESETS = {
  precious: ['minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore', 'minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore', 'minecraft:ancient_debris', 'minecraft:nether_gold_ore'],
  redstone: ['minecraft:redstone_ore', 'minecraft:deepslate_redstone_ore', 'minecraft:lapis_ore', 'minecraft:deepslate_lapis_ore', 'minecraft:copper_ore', 'minecraft:deepslate_copper_ore', 'minecraft:gold_ore', 'minecraft:deepslate_gold_ore'],
  nether: ['minecraft:ancient_debris', 'minecraft:nether_gold_ore', 'minecraft:nether_quartz_ore', 'minecraft:glowstone', 'minecraft:soul_sand'],
  all: ['minecraft:coal_ore', 'minecraft:deepslate_coal_ore', 'minecraft:iron_ore', 'minecraft:deepslate_iron_ore', 'minecraft:copper_ore', 'minecraft:deepslate_copper_ore', 'minecraft:gold_ore', 'minecraft:deepslate_gold_ore', 'minecraft:redstone_ore', 'minecraft:deepslate_redstone_ore', 'minecraft:lapis_ore', 'minecraft:deepslate_lapis_ore', 'minecraft:diamond_ore', 'minecraft:deepslate_diamond_ore', 'minecraft:emerald_ore', 'minecraft:deepslate_emerald_ore', 'minecraft:nether_gold_ore', 'minecraft:nether_quartz_ore', 'minecraft:ancient_debris'],
};
document.querySelectorAll('[data-xray-apply]').forEach((btn) => btn.addEventListener('click', () => {
  const form = btn.closest('form');
  const sel = form && form.querySelector('[data-xray-preset]');
  const area = form && form.querySelector('textarea[name="c_xrayBlocks"], textarea[name="xrayBlocks"]');
  if (sel && area && sel.value !== 'custom' && XRAY_PRESETS[sel.value]) area.value = XRAY_PRESETS[sel.value].join('\n');
}));
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
  for (const v of ['versions', 'instances', 'diagnostics']) $('#view-' + v).hidden = v !== b.dataset.view;
  if (b.dataset.view === 'instances') { loadInstances(); loadClientStatus(); }
}));

/* ---------- Akun ---------- */
async function loadAccount() {
  const box = $('#accountBox');
  try {
    const s = await api('/api/auth/status');
    if (!s.configured) {
      box.innerHTML = `<span class="badge">Login belum diatur</span><button id="setupBtn">Panduan setup Microsoft</button>`;
      $('#setupBtn').onclick = async () => {
        try { await api('/api/auth/login-url'); } catch (e) { alert('Setup MICROSOFT_CLIENT_ID:\n\n' + (e.steps || [e.message]).join('\n')); }
      };
      return;
    }
    if (!s.loggedIn) {
      box.innerHTML = `<span>Belum login</span><button id="loginBtn">Login Microsoft</button>`;
      $('#loginBtn').onclick = async () => { const { url } = await api('/api/auth/login-url'); await openExternal(url); alert('Selesaikan login Microsoft di browser sistem, lalu kembali ke aplikasi ini. Status akun dimuat ulang saat jendela aktif lagi.'); };
      return;
    }
    const p = s.profile;
    box.innerHTML = `<img alt="" src="https://minotar.net/helm/${encodeURIComponent(p.name)}/64.png" onerror="this.remove()"><span><strong>${esc(p.name)}</strong><br><small class="muted">Java Edition terverifikasi</small></span><button id="logoutBtn">Logout</button>`;
    $('#logoutBtn').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); loadAccount(); };
  } catch (e) { box.textContent = 'Akun: ' + e.message; }
}

/* ---------- Versi ---------- */
async function loadVersions() {
  const list = $('#versionList'); list.innerHTML = 'Memuat manifest Mojang…';
  try {
    const data = await api(`/api/versions?type=${encodeURIComponent($('#type').value)}&q=${encodeURIComponent($('#q').value)}`);
    $('#latestInfo').textContent = `Latest release: ${data.latest.release} • snapshot: ${data.latest.snapshot} • ${data.total} versi cocok`;
    list.innerHTML = data.versions.map((v) => `<div class="vcard"><strong>${esc(v.id)}</strong> <span class="badge">${esc(v.type)}</span><br><small>${esc((v.releaseTime || '').slice(0, 10))}</small><br><button data-install="${esc(v.id)}">Buat instance + Install</button></div>`).join('') || 'Tidak ada versi cocok.';
    list.querySelectorAll('[data-install]').forEach((b) => b.onclick = async () => {
      const name = prompt('Nama instance untuk ' + b.dataset.install + ':', b.dataset.install);
      if (!name) return;
      try {
        const { instance } = await api('/api/instances', { method: 'POST', body: JSON.stringify({ name, versionId: b.dataset.install }) });
        await startInstall(instance);
        document.querySelector('[data-view="instances"]').click();
      } catch (e) { alert(e.message); }
    });
  } catch (e) { list.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
}
let timer;
$('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadVersions, 350); });
$('#type').addEventListener('change', loadVersions);
$('#reloadVersions').addEventListener('click', loadVersions);

/* ---------- Instance ---------- */
async function startInstall(inst) {
  const { job } = await api(`/api/instances/${encodeURIComponent(inst.id)}/install`, { method: 'POST' });
  const d = $('#jobDialog'); $('#jobTitle').textContent = 'Install ' + inst.versionId; d.showModal();
  const poll = async () => {
    const { job: j } = await api('/api/jobs/' + job.id);
    $('#jobBar').value = j.progress; $('#jobDetail').textContent = (j.detail || j.status) + (j.error ? ' — ' + j.error : '');
    if (j.status === 'running') setTimeout(poll, 700);
    else { loadInstances(); if (j.status === 'error') alert('Install gagal: ' + j.error); }
  };
  poll();
}
async function loadClientStatus() {
  const box = $('#clientStatus');
  if (!box) return;
  try {
    const s = await api('/api/client/status');
    box.innerHTML = `<h2>PlumClient — Minecraft ${esc(s.targetMinecraft)}</h2>
      <p>${s.jarBuilt ? '<span class="ok">JAR siap:</span> ' + esc(s.jarPath) : '<span class="err">JAR belum dibangun.</span> Jalankan <code>' + esc(s.buildCommand) + '</code>, lalu Install instance PlumClient.'}</p>
      <p>${s.features.map((f) => `<span class="badge">${esc(f.name)} [${esc(f.hotkey)}]</span>`).join(' ')}</p>
      <small class="muted">${esc(s.warning)}</small>`;
  } catch (e) { box.textContent = 'PlumClient: ' + e.message; }
}
function fillClientForm(inst) {
  const form = $('#clientForm');
  if (!form || !inst) return;
  const c = inst.client || {};
  form.xrayEnabled.checked = !!c.xrayEnabled;
  form.xrayHighlight.checked = c.xrayHighlight !== false;
  form.xrayRadius.value = c.xrayRadius || 16;
  form.xrayMaxHighlights.value = c.xrayMaxHighlights || 6;
  form.showOreTracker.checked = c.showOreTracker !== false;
  form.autoBrightEnabled.checked = c.autoBrightEnabled !== false;
  form.autoClickEnabled.checked = !!c.autoClickEnabled;
  form.autoClickCps.value = c.autoClickCps || 10;
  form.autoClickHumanizer.checked = c.autoClickHumanizer !== false;
  form.autoClickCpsMin.value = c.autoClickCpsMin || 8;
  form.autoClickCpsMax.value = c.autoClickCpsMax || 14;
  form.autoClickSmoothAim.checked = c.autoClickSmoothAim !== false;
  form.autoClickJitter.value = c.autoClickJitter ?? 1;
  form.autoClickMode.value = c.autoClickMode || 'attack';
  form.autoClickTarget.value = c.autoClickTarget || 'either';
  form.autoClickCooldownSync.checked = c.autoClickCooldownSync !== false;
  form.autoClickToolGuard.checked = c.autoClickToolGuard !== false;
  form.autoClickMinDurability.value = c.autoClickMinDurability || 5;
  form.autoWeaponEnabled.checked = !!c.autoWeaponEnabled;
  form.autoBowEnabled.checked = !!c.autoBowEnabled;
  form.autoBowRange.value = c.autoBowRange || 32;
  form.autoBowFullCharge.checked = c.autoBowFullCharge !== false;
  form.noFallEnabled.checked = !!c.noFallEnabled;
  form.strongholdFinderEnabled.checked = !!c.strongholdFinderEnabled;
  form.crosshairEnabled.checked = !!c.crosshairEnabled;
  form.crosshairStyle.value = c.crosshairStyle || 'cross';
  form.crosshairSize.value = c.crosshairSize || 8;
  form.crosshairColor.value = c.crosshairColor || 'white';
  form.espEnabled.checked = !!c.espEnabled;
  form.espRange.value = c.espRange || 64;
  form.espTargets.value = c.espTargets || 'hostile';
  form.tracersEnabled.checked = !!c.tracersEnabled;
  form.tracerRange.value = c.tracerRange || 64;
  form.tracerTargets.value = c.tracerTargets || 'hostile';
  form.chestFinderEnabled.checked = !!c.chestFinderEnabled;
  form.chestRadius.value = c.chestRadius || 32;
  form.scaffoldEnabled.checked = !!c.scaffoldEnabled;
  form.autoToolEnabled.checked = !!c.autoToolEnabled;
  form.discordRpcEnabled.checked = !!c.discordRpcEnabled;
  form.discordAppId.value = c.discordAppId || '';
  form.jesusEnabled.checked = !!c.jesusEnabled;
  form.chestStealerEnabled.checked = !!c.chestStealerEnabled;
  form.antiFogEnabled.checked = !!c.antiFogEnabled;
  form.chamsEnabled.checked = !!c.chamsEnabled;
  form.triggerbotEnabled.checked = !!c.triggerbotEnabled;
  form.killAuraEnabled.checked = !!c.killAuraEnabled;
  form.killAuraRange.value = c.killAuraRange ?? 4.5;
  form.killAuraScanRange.value = c.killAuraScanRange ?? 6;
  form.killAuraTargets.value = c.killAuraTargets || 'hostile';
  form.killAuraPriority.value = c.killAuraPriority || 'distance';
  form.killAuraMode.value = c.killAuraMode || 'single';
  form.killAuraSwitchDelayMs.value = c.killAuraSwitchDelayMs ?? 250;
  form.killAuraFov.value = c.killAuraFov || 120;
  form.killAuraRotationSpeed.value = c.killAuraRotationSpeed || 60;
  form.killAuraCps.value = c.killAuraCps || 12;
  form.killAuraThroughWalls.checked = !!c.killAuraThroughWalls;
  form.killAuraIgnoreInvisible.checked = c.killAuraIgnoreInvisible !== false;
  form.killAuraSmartCrit.checked = c.killAuraSmartCrit !== false;
  form.killAuraRequireCooldown.checked = c.killAuraRequireCooldown !== false;
  form.velocityEnabled.checked = !!c.velocityEnabled;
  form.velocityMode.value = c.velocityMode || 'reduce';
  form.velocityHorizontal.value = c.velocityHorizontal ?? 20;
  form.velocityVertical.value = c.velocityVertical ?? 100;
  form.velocityDelayTicks.value = c.velocityDelayTicks ?? 0;
  form.velocityJumpReset.checked = !!c.velocityJumpReset;
  form.velocityJumpResetChance.value = c.velocityJumpResetChance ?? 30;
  form.velocityRequireMoving.checked = !!c.velocityRequireMoving;
  form.sprintEnabled.checked = !!c.sprintEnabled;
  form.sprintMode.value = c.sprintMode || 'legit';
  form.sprintKeepSprint.checked = c.sprintKeepSprint !== false;
  form.sprintWhileUsing.checked = !!c.sprintWhileUsing;
  form.autoArmorEnabled.checked = !!c.autoArmorEnabled;
  form.autoArmorDelayMs.value = c.autoArmorDelayMs || 150;
  form.autoArmorHotbarOnly.checked = !!c.autoArmorHotbarOnly;
  form.autoArmorPreferElytra.checked = !!c.autoArmorPreferElytra;
  form.autoArmorDropOld.checked = !!c.autoArmorDropOld;
  form.freecamEnabled.checked = !!c.freecamEnabled;
  form.freecamSpeed.value = c.freecamSpeed ?? 1;
  form.freecamFreeze.checked = c.freecamFreeze !== false;
  form.freecamShowPlayer.checked = c.freecamShowPlayer !== false;
  form.jesusAffectWater.checked = c.jesusAffectWater !== false;
  form.jesusAffectLava.checked = c.jesusAffectLava !== false;
  form.jesusLift.value = c.jesusLift ?? 0.08;
  form.xrayExposedOnly.checked = !!c.xrayExposedOnly;
  form.xrayValuableFirst.checked = !!c.xrayValuableFirst;
  form.autoBrightGamma.value = c.autoBrightGamma ?? 15;
  form.autoBrightFade.checked = c.autoBrightFade !== false;
  form.autoClickUseCpsMin.value = c.autoClickUseCpsMin || 8;
  form.autoClickUseCpsMax.value = c.autoClickUseCpsMax || 14;
  form.autoWeaponSwitchDelayMs.value = c.autoWeaponSwitchDelayMs ?? 150;
  form.autoWeaponEnchantWeight.checked = c.autoWeaponEnchantWeight !== false;
  form.autoBowPredictive.checked = c.autoBowPredictive !== false;
  form.noFallMinDistance.value = c.noFallMinDistance || 3;
  form.noFallIntervalMs.value = c.noFallIntervalMs || 100;
  form.strongholdMinSeparation.value = c.strongholdMinSeparation || 8;
  form.crosshairDynamic.checked = !!c.crosshairDynamic;
  form.crosshairHitMarker.checked = c.crosshairHitMarker !== false;
  form.espShowHealth.checked = !!c.espShowHealth;
  form.tracerThickness.value = c.tracerThickness || 2;
  form.tracerVisibleOnly.checked = !!c.tracerVisibleOnly;
  form.chestFinderTypes.value = c.chestFinderTypes || 'all';
  form.scaffoldDelayMs.value = c.scaffoldDelayMs || 100;
  form.scaffoldTower.checked = !!c.scaffoldTower;
  form.autoToolSwitchDelayMs.value = c.autoToolSwitchDelayMs ?? 100;
  form.autoToolPreferSilk.checked = !!c.autoToolPreferSilk;
  form.discordShowModules.checked = !!c.discordShowModules;
  form.chestStealerDelayMs.value = c.chestStealerDelayMs || 75;
  form.chestStealerValuableOnly.checked = !!c.chestStealerValuableOnly;
  form.antiFogMode.value = c.antiFogMode || 'full';
  form.antiFogFactor.value = c.antiFogFactor || 4;
  form.chamsTint.checked = !!c.chamsTint;
  form.triggerbotTargets.value = c.triggerbotTargets || 'hostile';
  form.triggerbotDelayMinMs.value = c.triggerbotDelayMinMs ?? 0;
  form.triggerbotDelayMaxMs.value = c.triggerbotDelayMaxMs ?? 80;
  form.hudActiveOnly.checked = !!c.hudActiveOnly;
  form.clickGuiEnabled.checked = c.clickGuiEnabled !== false;
  form.criticalsEnabled.checked = !!c.criticalsEnabled;
  form.criticalsMode.value = c.criticalsMode || 'mini';
  form.criticalsCooldownMs.value = c.criticalsCooldownMs ?? 350;
  form.noSlowEnabled.checked = !!c.noSlowEnabled;
  form.noSlowKeepSprint.checked = c.noSlowKeepSprint !== false;
  form.autoTotemEnabled.checked = !!c.autoTotemEnabled;
  form.autoTotemHealth.value = c.autoTotemHealth || 10;
  form.autoTotemDelayMs.value = c.autoTotemDelayMs || 120;
  form.autoTotemAlways.checked = !!c.autoTotemAlways;
  form.trajectoriesEnabled.checked = !!c.trajectoriesEnabled;
  form.trajectoriesSteps.value = c.trajectoriesSteps || 80;
  form.nameTagsEnabled.checked = !!c.nameTagsEnabled;
  form.nameTagsRange.value = c.nameTagsRange || 64;
  form.nameTagsTargets.value = c.nameTagsTargets || 'hostile';
  form.nameTagsShowHealth.checked = c.nameTagsShowHealth !== false;
  form.nameTagsShowDistance.checked = c.nameTagsShowDistance !== false;
  form.invManagerEnabled.checked = !!c.invManagerEnabled;
  form.invManagerDelayMs.value = c.invManagerDelayMs || 200;
  form.invManagerDropDuplicates.checked = c.invManagerDropDuplicates !== false;
  form.invManagerSortHotbar.checked = c.invManagerSortHotbar !== false;
  form.autoFishEnabled.checked = !!c.autoFishEnabled;
  form.autoFishRecastMs.value = c.autoFishRecastMs || 600;
  form.autoMineEnabled.checked = !!c.autoMineEnabled;
  form.autoMineOreAssist.checked = !!c.autoMineOreAssist;
  form.autoMineScanRange.value = c.autoMineScanRange || 16;
  form.entityCacheMs.value = c.entityCacheMs || 50;
  form.hudEnabled.checked = c.hudEnabled !== false;
  form.showTps.checked = c.showTps !== false;
  form.showFps.checked = c.showFps !== false;
  form.showCps.checked = c.showCps !== false;
  form.showPing.checked = c.showPing !== false;
  form.showCoordinates.checked = c.showCoordinates !== false;
  form.showBiome.checked = c.showBiome !== false;
  form.showCompass.checked = c.showCompass !== false;
  form.showArmor.checked = c.showArmor !== false;
  form.showEffects.checked = c.showEffects !== false;
  form.showSession.checked = c.showSession !== false;
  form.xrayBlocks.value = (c.xrayBlocks || []).join('\n');
  renderQuickToggles(c);
}
const QUICK_TOGGLES = [
  ['xrayEnabled', 'Xray'], ['autoBrightEnabled', 'AutoBright'], ['autoClickEnabled', 'AutoClick'],
  ['autoWeaponEnabled', 'AutoWeapon'], ['autoBowEnabled', 'AutoBow'], ['noFallEnabled', 'NoFall'],
  ['strongholdFinderEnabled', 'Stronghold'], ['crosshairEnabled', 'Crosshair'], ['espEnabled', 'ESP'],
  ['tracersEnabled', 'Tracers'], ['chestFinderEnabled', 'Chest Finder'], ['scaffoldEnabled', 'Scaffold'],
  ['autoToolEnabled', 'AutoTool'], ['discordRpcEnabled', 'Discord RPC'], ['hudEnabled', 'HUD'],
  ['jesusEnabled', 'Jesus'], ['chestStealerEnabled', 'Chest Stealer'], ['antiFogEnabled', 'AntiFog'],
  ['chamsEnabled', 'Chams'], ['triggerbotEnabled', 'Triggerbot'],
  ['killAuraEnabled', 'KillAura'], ['velocityEnabled', 'Velocity'], ['sprintEnabled', 'Sprint'],
  ['autoArmorEnabled', 'AutoArmor'], ['freecamEnabled', 'Freecam'],
  ['criticalsEnabled', 'Criticals'], ['noSlowEnabled', 'NoSlow'], ['autoTotemEnabled', 'AutoTotem'],
  ['trajectoriesEnabled', 'Trajectories'], ['nameTagsEnabled', 'NameTags'], ['invManagerEnabled', 'InvManager'],
  ['autoFishEnabled', 'AutoFish'], ['autoMineEnabled', 'AutoMine'],
];
document.querySelectorAll('[data-client-search]').forEach((input) => {
  input.addEventListener('input', () => {
    const form = input.closest('form');
    if (!form) return;
    const q = input.value.trim().toLowerCase();
    form.querySelectorAll('label').forEach((label) => {
      if (label.contains(input)) { label.style.display = ''; return; }
      label.style.display = !q || label.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
});
function renderQuickToggles(c = {}) {
  const box = $('#quickToggles');
  if (!box) return;
  box.innerHTML = QUICK_TOGGLES.map(([key, label]) => `<button type="button" data-toggle="${key}" class="chip ${c[key] ? 'on' : 'off'}">${label}: ${c[key] ? 'ON' : 'OFF'}</button>`).join(' ');
  box.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => quickToggle(b.dataset.toggle));
}
function readClientForm() {
  const f = new FormData($('#clientForm'));
  return {
    xrayEnabled: f.get('xrayEnabled') === 'on', xrayHighlight: f.get('xrayHighlight') === 'on', xrayRadius: Number(f.get('xrayRadius') || 16), xrayMaxHighlights: Number(f.get('xrayMaxHighlights') || 6), showOreTracker: f.get('showOreTracker') === 'on',
    autoBrightEnabled: f.get('autoBrightEnabled') === 'on',
    autoClickEnabled: f.get('autoClickEnabled') === 'on', autoClickCps: Number(f.get('autoClickCps') || 10), autoClickHumanizer: f.get('autoClickHumanizer') === 'on', autoClickCpsMin: Number(f.get('autoClickCpsMin') || 8), autoClickCpsMax: Number(f.get('autoClickCpsMax') || 14), autoClickSmoothAim: f.get('autoClickSmoothAim') === 'on', autoClickJitter: Number(f.get('autoClickJitter') ?? 1), autoClickMode: f.get('autoClickMode') || 'attack', autoClickTarget: f.get('autoClickTarget') || 'either', autoClickCooldownSync: f.get('autoClickCooldownSync') === 'on', autoClickToolGuard: f.get('autoClickToolGuard') === 'on', autoClickMinDurability: Number(f.get('autoClickMinDurability') || 5),
    autoWeaponEnabled: f.get('autoWeaponEnabled') === 'on', autoBowEnabled: f.get('autoBowEnabled') === 'on', autoBowRange: Number(f.get('autoBowRange') || 32), autoBowFullCharge: f.get('autoBowFullCharge') === 'on', noFallEnabled: f.get('noFallEnabled') === 'on', strongholdFinderEnabled: f.get('strongholdFinderEnabled') === 'on', crosshairEnabled: f.get('crosshairEnabled') === 'on', crosshairStyle: f.get('crosshairStyle') || 'cross', crosshairSize: Number(f.get('crosshairSize') || 8), crosshairColor: f.get('crosshairColor') || 'white',
    espEnabled: f.get('espEnabled') === 'on', espRange: Number(f.get('espRange') || 64), espTargets: f.get('espTargets') || 'hostile', tracersEnabled: f.get('tracersEnabled') === 'on', tracerRange: Number(f.get('tracerRange') || 64), tracerTargets: f.get('tracerTargets') || 'hostile', chestFinderEnabled: f.get('chestFinderEnabled') === 'on', chestRadius: Number(f.get('chestRadius') || 32), scaffoldEnabled: f.get('scaffoldEnabled') === 'on', autoToolEnabled: f.get('autoToolEnabled') === 'on', discordRpcEnabled: f.get('discordRpcEnabled') === 'on', discordAppId: f.get('discordAppId') || '', jesusEnabled: f.get('jesusEnabled') === 'on', chestStealerEnabled: f.get('chestStealerEnabled') === 'on', antiFogEnabled: f.get('antiFogEnabled') === 'on', chamsEnabled: f.get('chamsEnabled') === 'on', triggerbotEnabled: f.get('triggerbotEnabled') === 'on',
    killAuraEnabled: f.get('killAuraEnabled') === 'on', killAuraRange: Number(f.get('killAuraRange') || 4.5), killAuraScanRange: Number(f.get('killAuraScanRange') || 6), killAuraTargets: f.get('killAuraTargets') || 'hostile', killAuraPriority: f.get('killAuraPriority') || 'distance', killAuraMode: f.get('killAuraMode') || 'single', killAuraSwitchDelayMs: Number(f.get('killAuraSwitchDelayMs') ?? 250), killAuraFov: Number(f.get('killAuraFov') || 120), killAuraRotationSpeed: Number(f.get('killAuraRotationSpeed') || 60), killAuraCps: Number(f.get('killAuraCps') || 12), killAuraThroughWalls: f.get('killAuraThroughWalls') === 'on', killAuraIgnoreInvisible: f.get('killAuraIgnoreInvisible') === 'on', killAuraSmartCrit: f.get('killAuraSmartCrit') === 'on', killAuraRequireCooldown: f.get('killAuraRequireCooldown') === 'on',
    velocityEnabled: f.get('velocityEnabled') === 'on', velocityMode: f.get('velocityMode') || 'reduce', velocityHorizontal: Number(f.get('velocityHorizontal') ?? 20), velocityVertical: Number(f.get('velocityVertical') ?? 100), velocityDelayTicks: Number(f.get('velocityDelayTicks') ?? 0), velocityJumpReset: f.get('velocityJumpReset') === 'on', velocityJumpResetChance: Number(f.get('velocityJumpResetChance') || 30), velocityRequireMoving: f.get('velocityRequireMoving') === 'on',
    sprintEnabled: f.get('sprintEnabled') === 'on', sprintMode: f.get('sprintMode') || 'legit', sprintKeepSprint: f.get('sprintKeepSprint') === 'on', sprintWhileUsing: f.get('sprintWhileUsing') === 'on',
    autoArmorEnabled: f.get('autoArmorEnabled') === 'on', autoArmorDelayMs: Number(f.get('autoArmorDelayMs') || 150), autoArmorHotbarOnly: f.get('autoArmorHotbarOnly') === 'on', autoArmorPreferElytra: f.get('autoArmorPreferElytra') === 'on', autoArmorDropOld: f.get('autoArmorDropOld') === 'on',
    freecamEnabled: f.get('freecamEnabled') === 'on', freecamSpeed: Number(f.get('freecamSpeed') || 1), freecamFreeze: f.get('freecamFreeze') === 'on', freecamShowPlayer: f.get('freecamShowPlayer') === 'on',
    clickGuiEnabled: f.get('clickGuiEnabled') === 'on', criticalsEnabled: f.get('criticalsEnabled') === 'on', criticalsMode: f.get('criticalsMode') || 'mini', criticalsCooldownMs: Number(f.get('criticalsCooldownMs') ?? 350), noSlowEnabled: f.get('noSlowEnabled') === 'on', noSlowKeepSprint: f.get('noSlowKeepSprint') === 'on', autoTotemEnabled: f.get('autoTotemEnabled') === 'on', autoTotemHealth: Number(f.get('autoTotemHealth') || 10), autoTotemDelayMs: Number(f.get('autoTotemDelayMs') || 120), autoTotemAlways: f.get('autoTotemAlways') === 'on', trajectoriesEnabled: f.get('trajectoriesEnabled') === 'on', trajectoriesSteps: Number(f.get('trajectoriesSteps') || 80), nameTagsEnabled: f.get('nameTagsEnabled') === 'on', nameTagsRange: Number(f.get('nameTagsRange') || 64), nameTagsTargets: f.get('nameTagsTargets') || 'hostile', nameTagsShowHealth: f.get('nameTagsShowHealth') === 'on', nameTagsShowDistance: f.get('nameTagsShowDistance') === 'on', invManagerEnabled: f.get('invManagerEnabled') === 'on', invManagerDelayMs: Number(f.get('invManagerDelayMs') || 200), invManagerDropDuplicates: f.get('invManagerDropDuplicates') === 'on', invManagerSortHotbar: f.get('invManagerSortHotbar') === 'on', autoFishEnabled: f.get('autoFishEnabled') === 'on', autoFishRecastMs: Number(f.get('autoFishRecastMs') || 600), autoMineEnabled: f.get('autoMineEnabled') === 'on', autoMineOreAssist: f.get('autoMineOreAssist') === 'on', autoMineScanRange: Number(f.get('autoMineScanRange') || 16), entityCacheMs: Number(f.get('entityCacheMs') || 50),
    jesusAffectWater: f.get('jesusAffectWater') === 'on', jesusAffectLava: f.get('jesusAffectLava') === 'on', jesusLift: Number(f.get('jesusLift') ?? 0.08), xrayExposedOnly: f.get('xrayExposedOnly') === 'on', xrayValuableFirst: f.get('xrayValuableFirst') === 'on', autoBrightGamma: Number(f.get('autoBrightGamma') || 15), autoBrightFade: f.get('autoBrightFade') === 'on', autoClickUseCpsMin: Number(f.get('autoClickUseCpsMin') || 8), autoClickUseCpsMax: Number(f.get('autoClickUseCpsMax') || 14), autoWeaponSwitchDelayMs: Number(f.get('autoWeaponSwitchDelayMs') ?? 150), autoWeaponEnchantWeight: f.get('autoWeaponEnchantWeight') === 'on', autoBowPredictive: f.get('autoBowPredictive') === 'on', noFallMinDistance: Number(f.get('noFallMinDistance') || 3), noFallIntervalMs: Number(f.get('noFallIntervalMs') || 100), strongholdMinSeparation: Number(f.get('strongholdMinSeparation') || 8), crosshairDynamic: f.get('crosshairDynamic') === 'on', crosshairHitMarker: f.get('crosshairHitMarker') === 'on', espShowHealth: f.get('espShowHealth') === 'on', tracerThickness: Number(f.get('tracerThickness') || 2), tracerVisibleOnly: f.get('tracerVisibleOnly') === 'on', chestFinderTypes: f.get('chestFinderTypes') || 'all', scaffoldDelayMs: Number(f.get('scaffoldDelayMs') || 100), scaffoldTower: f.get('scaffoldTower') === 'on', autoToolSwitchDelayMs: Number(f.get('autoToolSwitchDelayMs') ?? 100), autoToolPreferSilk: f.get('autoToolPreferSilk') === 'on', discordShowModules: f.get('discordShowModules') === 'on', chestStealerDelayMs: Number(f.get('chestStealerDelayMs') || 75), chestStealerValuableOnly: f.get('chestStealerValuableOnly') === 'on', antiFogMode: f.get('antiFogMode') || 'full', antiFogFactor: Number(f.get('antiFogFactor') || 4), chamsTint: f.get('chamsTint') === 'on', triggerbotTargets: f.get('triggerbotTargets') || 'hostile', triggerbotDelayMinMs: Number(f.get('triggerbotDelayMinMs') ?? 0), triggerbotDelayMaxMs: Number(f.get('triggerbotDelayMaxMs') ?? 80), hudActiveOnly: f.get('hudActiveOnly') === 'on',
    hudEnabled: f.get('hudEnabled') === 'on', showTps: f.get('showTps') === 'on',
    showFps: f.get('showFps') === 'on', showCps: f.get('showCps') === 'on', showPing: f.get('showPing') === 'on',
    showCoordinates: f.get('showCoordinates') === 'on', showBiome: f.get('showBiome') === 'on', showCompass: f.get('showCompass') === 'on',
    showArmor: f.get('showArmor') === 'on', showEffects: f.get('showEffects') === 'on', showSession: f.get('showSession') === 'on',
    xrayBlocks: f.get('xrayBlocks') || '',
  };
}
async function quickToggle(key) {
  const msg = $('#clientMsg');
  const id = $('#clientInstanceSelect').value;
  if (!id) { msg.innerHTML = '<span class="err">Tidak ada instance PlumClient. Buat dulu dengan loader PlumClient (Minecraft 1.21.4).</span>'; return; }
  try {
    const client = readClientForm();
    client[key] = !client[key];
    await api(`/api/instances/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ client }) });
    const form = $('#clientForm');
    if (form[key]) form[key].checked = client[key];
    renderQuickToggles(client);
    msg.innerHTML = '<span class="ok">' + esc(key) + ' ' + (client[key] ? 'ON' : 'OFF') + ' — berlaku live bila game jalan (±1 detik), atau saat Play berikutnya.</span>';
  } catch (e) { msg.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
}
async function loadInstances() {
  const box = $('#instanceList');
  try {
    const { instances } = await api('/api/instances');
    const sel = $('#clientInstanceSelect');
    if (sel) {
      const plum = instances.filter((i) => i.loader === 'plumclient');
      const prev = sel.value;
      sel.innerHTML = plum.map((i) => `<option value="${esc(i.id)}">${esc(i.name)} (${esc(i.versionId)})</option>`).join('') || '<option value="">Tidak ada instance PlumClient</option>';
      if (plum.some((i) => i.id === prev)) sel.value = prev;
      const current = plum.find((i) => i.id === sel.value) || plum[0];
      if (current) { sel.value = current.id; fillClientForm(current); }
    }
    box.innerHTML = instances.map((i) => `<div class="vcard icard"><strong>${esc(i.name)}</strong> <span class="badge">${i.running ? 'berjalan' : i.installed ? 'terpasang' : 'belum install'}</span> <span class="badge">${i.loader === 'plumclient' ? 'PlumClient' : 'Vanilla'}</span><br><small>${esc(i.versionId)} • RAM ${i.ramMb} MB • ${i.width}×${i.height}${i.loader === 'plumclient' ? ` • Xray ${i.client?.xrayEnabled ? 'ON' : 'OFF'}${i.client?.xrayHighlight ? '+highlight' : ''} • AutoBright ${i.client?.autoBrightEnabled ? 'ON' : 'OFF'} • AutoClick ${i.client?.autoClickEnabled ? (i.client.autoClickHumanizer !== false ? (i.client.autoClickCpsMin || 8) + '-' + (i.client.autoClickCpsMax || 14) + ' CPS~' : i.client.autoClickCps + ' CPS') + '/' + (i.client.autoClickTarget || 'either') : 'OFF'} • AutoWeapon ${i.client?.autoWeaponEnabled ? 'ON' : 'OFF'} • AutoBow ${i.client?.autoBowEnabled ? 'ON' : 'OFF'} • NoFall ${i.client?.noFallEnabled ? 'ON' : 'OFF'} • Stronghold ${i.client?.strongholdFinderEnabled ? 'ON' : 'OFF'} • Crosshair ${i.client?.crosshairEnabled ? i.client.crosshairStyle : 'OFF'} • KillAura ${i.client?.killAuraEnabled ? 'ON' : 'OFF'} • Velocity ${i.client?.velocityEnabled ? 'ON' : 'OFF'} • Sprint ${i.client?.sprintEnabled ? 'ON' : 'OFF'} • AutoArmor ${i.client?.autoArmorEnabled ? 'ON' : 'OFF'} • Freecam ${i.client?.freecamEnabled ? 'ON' : 'OFF'} • Criticals ${i.client?.criticalsEnabled ? 'ON' : 'OFF'} • NoSlow ${i.client?.noSlowEnabled ? 'ON' : 'OFF'} • Totem ${i.client?.autoTotemEnabled ? 'ON' : 'OFF'} • Traj ${i.client?.trajectoriesEnabled ? 'ON' : 'OFF'} • Tags ${i.client?.nameTagsEnabled ? 'ON' : 'OFF'} • InvMgr ${i.client?.invManagerEnabled ? 'ON' : 'OFF'} • Fish ${i.client?.autoFishEnabled ? 'ON' : 'OFF'} • Mine ${i.client?.autoMineEnabled ? 'ON' : 'OFF'} • TPS ${i.client?.showTps ? 'ON' : 'OFF'}` : ''}</small><br>
      <button data-act="install" data-id="${esc(i.id)}">Install / Perbaiki</button>
      <button class="play" data-act="launch" data-id="${esc(i.id)}">▶ Play</button>
      <button data-act="validate" data-id="${esc(i.id)}">Validasi</button>
      <button data-act="stop" data-id="${esc(i.id)}">Stop</button>
      <button data-act="logs" data-id="${esc(i.id)}">Log</button>
      <button data-act="del" data-id="${esc(i.id)}">Hapus</button></div>`).join('') || '<p class="muted">Belum ada instance. Buat dari tab Versi atau form di atas.</p>';
    box.querySelectorAll('button').forEach((b) => b.onclick = async () => {
      const id = b.dataset.id, found = instances.find((x) => x.id === id);
      try {
        if (b.dataset.act === 'install') await startInstall(found);
        if (b.dataset.act === 'launch') { const r = await api(`/api/instances/${encodeURIComponent(id)}/launch`, { method: 'POST' }); alert('Game dimulai (PID ' + r.pid + '). Lihat Log untuk output.'); }
        if (b.dataset.act === 'stop') { await api(`/api/instances/${encodeURIComponent(id)}/stop`, { method: 'POST' }); loadInstances(); }
        if (b.dataset.act === 'validate') { const v = await api(`/api/instances/${encodeURIComponent(id)}/validate`); alert(v.checks.map((c) => (c.ok ? '✓ ' : '✗ ') + c.name + ' — ' + c.detail).join('\n')); }
        if (b.dataset.act === 'logs') { document.querySelector('[data-view="diagnostics"]').click(); const show = async () => { const v = await api(`/api/instances/${encodeURIComponent(id)}/logs`); $('#logOut').textContent = v.logs.join('\n') || '(belum ada log)'; }; show(); window._logTimer && clearInterval(window._logTimer); window._logTimer = setInterval(show, 1500); }
        if (b.dataset.act === 'del' && confirm('Hapus instance ' + found.name + '? File game di dalamnya ikut terhapus.')) { await api(`/api/instances/${encodeURIComponent(id)}?files=1`, { method: 'DELETE' }); loadInstances(); }
      } catch (e) { alert(e.message + (e.missing ? '\nHilang: ' + e.missing.join(', ') : '')); }
    });
  } catch (e) { box.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
}
$('#createForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); const f = new FormData(ev.target); const msg = $('#createMsg');
  try {
    const body = Object.fromEntries(f); for (const k of ['ramMb', 'width', 'height']) body[k] = Number(body[k]);
    body.client = {
      xrayEnabled: f.get('c_xrayEnabled') === 'on', xrayHighlight: f.get('c_xrayHighlight') === 'on', xrayRadius: Number(f.get('c_xrayRadius') || 16), xrayMaxHighlights: Number(f.get('c_xrayMaxHighlights') || 6), showOreTracker: f.get('c_showOreTracker') === 'on',
      autoBrightEnabled: f.get('c_autoBrightEnabled') === 'on',
      autoClickEnabled: f.get('c_autoClickEnabled') === 'on', autoClickCps: Number(f.get('c_autoClickCps') || 10), autoClickHumanizer: f.get('c_autoClickHumanizer') === 'on', autoClickCpsMin: Number(f.get('c_autoClickCpsMin') || 8), autoClickCpsMax: Number(f.get('c_autoClickCpsMax') || 14), autoClickSmoothAim: f.get('c_autoClickSmoothAim') === 'on', autoClickJitter: Number(f.get('c_autoClickJitter') ?? 1), autoClickMode: f.get('c_autoClickMode') || 'attack', autoClickTarget: f.get('c_autoClickTarget') || 'either', autoClickCooldownSync: f.get('c_autoClickCooldownSync') === 'on', autoClickToolGuard: f.get('c_autoClickToolGuard') === 'on', autoClickMinDurability: Number(f.get('c_autoClickMinDurability') || 5),
      autoWeaponEnabled: f.get('c_autoWeaponEnabled') === 'on', autoBowEnabled: f.get('c_autoBowEnabled') === 'on', autoBowRange: Number(f.get('c_autoBowRange') || 32), autoBowFullCharge: f.get('c_autoBowFullCharge') === 'on', noFallEnabled: f.get('c_noFallEnabled') === 'on', strongholdFinderEnabled: f.get('c_strongholdFinderEnabled') === 'on', crosshairEnabled: f.get('c_crosshairEnabled') === 'on', crosshairStyle: f.get('c_crosshairStyle') || 'cross', crosshairSize: Number(f.get('c_crosshairSize') || 8), crosshairColor: f.get('c_crosshairColor') || 'white',
      espEnabled: f.get('c_espEnabled') === 'on', espRange: Number(f.get('c_espRange') || 64), espTargets: f.get('c_espTargets') || 'hostile', tracersEnabled: f.get('c_tracersEnabled') === 'on', tracerRange: Number(f.get('c_tracerRange') || 64), tracerTargets: f.get('c_tracerTargets') || 'hostile', chestFinderEnabled: f.get('c_chestFinderEnabled') === 'on', chestRadius: Number(f.get('c_chestRadius') || 32), scaffoldEnabled: f.get('c_scaffoldEnabled') === 'on', autoToolEnabled: f.get('c_autoToolEnabled') === 'on', discordRpcEnabled: f.get('c_discordRpcEnabled') === 'on', discordAppId: f.get('c_discordAppId') || '', jesusEnabled: f.get('c_jesusEnabled') === 'on', chestStealerEnabled: f.get('c_chestStealerEnabled') === 'on', antiFogEnabled: f.get('c_antiFogEnabled') === 'on', chamsEnabled: f.get('c_chamsEnabled') === 'on', triggerbotEnabled: f.get('c_triggerbotEnabled') === 'on',
      killAuraEnabled: f.get('c_killAuraEnabled') === 'on', killAuraRange: Number(f.get('c_killAuraRange') || 4.5), killAuraScanRange: Number(f.get('c_killAuraScanRange') || 6), killAuraTargets: f.get('c_killAuraTargets') || 'hostile', killAuraPriority: f.get('c_killAuraPriority') || 'distance', killAuraMode: f.get('c_killAuraMode') || 'single', killAuraSwitchDelayMs: Number(f.get('c_killAuraSwitchDelayMs') ?? 250), killAuraFov: Number(f.get('c_killAuraFov') || 120), killAuraRotationSpeed: Number(f.get('c_killAuraRotationSpeed') || 60), killAuraCps: Number(f.get('c_killAuraCps') || 12), killAuraThroughWalls: f.get('c_killAuraThroughWalls') === 'on', killAuraIgnoreInvisible: f.get('c_killAuraIgnoreInvisible') === 'on', killAuraSmartCrit: f.get('c_killAuraSmartCrit') === 'on', killAuraRequireCooldown: f.get('c_killAuraRequireCooldown') === 'on',
      velocityEnabled: f.get('c_velocityEnabled') === 'on', velocityMode: f.get('c_velocityMode') || 'reduce', velocityHorizontal: Number(f.get('c_velocityHorizontal') ?? 20), velocityVertical: Number(f.get('c_velocityVertical') ?? 100), velocityDelayTicks: Number(f.get('c_velocityDelayTicks') ?? 0), velocityJumpReset: f.get('c_velocityJumpReset') === 'on', velocityJumpResetChance: Number(f.get('c_velocityJumpResetChance') || 30), velocityRequireMoving: f.get('c_velocityRequireMoving') === 'on',
      sprintEnabled: f.get('c_sprintEnabled') === 'on', sprintMode: f.get('c_sprintMode') || 'legit', sprintKeepSprint: f.get('c_sprintKeepSprint') === 'on', sprintWhileUsing: f.get('c_sprintWhileUsing') === 'on',
      autoArmorEnabled: f.get('c_autoArmorEnabled') === 'on', autoArmorDelayMs: Number(f.get('c_autoArmorDelayMs') || 150), autoArmorHotbarOnly: f.get('c_autoArmorHotbarOnly') === 'on', autoArmorPreferElytra: f.get('c_autoArmorPreferElytra') === 'on', autoArmorDropOld: f.get('c_autoArmorDropOld') === 'on',
      freecamEnabled: f.get('c_freecamEnabled') === 'on', freecamSpeed: Number(f.get('c_freecamSpeed') || 1), freecamFreeze: f.get('c_freecamFreeze') === 'on', freecamShowPlayer: f.get('c_freecamShowPlayer') === 'on',
      clickGuiEnabled: f.get('c_clickGuiEnabled') === 'on', criticalsEnabled: f.get('c_criticalsEnabled') === 'on', criticalsMode: f.get('c_criticalsMode') || 'mini', criticalsCooldownMs: Number(f.get('c_criticalsCooldownMs') ?? 350), noSlowEnabled: f.get('c_noSlowEnabled') === 'on', noSlowKeepSprint: f.get('c_noSlowKeepSprint') === 'on', autoTotemEnabled: f.get('c_autoTotemEnabled') === 'on', autoTotemHealth: Number(f.get('c_autoTotemHealth') || 10), autoTotemDelayMs: Number(f.get('c_autoTotemDelayMs') || 120), autoTotemAlways: f.get('c_autoTotemAlways') === 'on', trajectoriesEnabled: f.get('c_trajectoriesEnabled') === 'on', trajectoriesSteps: Number(f.get('c_trajectoriesSteps') || 80), nameTagsEnabled: f.get('c_nameTagsEnabled') === 'on', nameTagsRange: Number(f.get('c_nameTagsRange') || 64), nameTagsTargets: f.get('c_nameTagsTargets') || 'hostile', nameTagsShowHealth: f.get('c_nameTagsShowHealth') === 'on', nameTagsShowDistance: f.get('c_nameTagsShowDistance') === 'on', invManagerEnabled: f.get('c_invManagerEnabled') === 'on', invManagerDelayMs: Number(f.get('c_invManagerDelayMs') || 200), invManagerDropDuplicates: f.get('c_invManagerDropDuplicates') === 'on', invManagerSortHotbar: f.get('c_invManagerSortHotbar') === 'on', autoFishEnabled: f.get('c_autoFishEnabled') === 'on', autoFishRecastMs: Number(f.get('c_autoFishRecastMs') || 600), autoMineEnabled: f.get('c_autoMineEnabled') === 'on', autoMineOreAssist: f.get('c_autoMineOreAssist') === 'on', autoMineScanRange: Number(f.get('c_autoMineScanRange') || 16), entityCacheMs: Number(f.get('c_entityCacheMs') || 50),
      jesusAffectWater: f.get('c_jesusAffectWater') === 'on', jesusAffectLava: f.get('c_jesusAffectLava') === 'on', jesusLift: Number(f.get('c_jesusLift') ?? 0.08), xrayExposedOnly: f.get('c_xrayExposedOnly') === 'on', xrayValuableFirst: f.get('c_xrayValuableFirst') === 'on', autoBrightGamma: Number(f.get('c_autoBrightGamma') || 15), autoBrightFade: f.get('c_autoBrightFade') === 'on', autoClickUseCpsMin: Number(f.get('c_autoClickUseCpsMin') || 8), autoClickUseCpsMax: Number(f.get('c_autoClickUseCpsMax') || 14), autoWeaponSwitchDelayMs: Number(f.get('c_autoWeaponSwitchDelayMs') ?? 150), autoWeaponEnchantWeight: f.get('c_autoWeaponEnchantWeight') === 'on', autoBowPredictive: f.get('c_autoBowPredictive') === 'on', noFallMinDistance: Number(f.get('c_noFallMinDistance') || 3), noFallIntervalMs: Number(f.get('c_noFallIntervalMs') || 100), strongholdMinSeparation: Number(f.get('c_strongholdMinSeparation') || 8), crosshairDynamic: f.get('c_crosshairDynamic') === 'on', crosshairHitMarker: f.get('c_crosshairHitMarker') === 'on', espShowHealth: f.get('c_espShowHealth') === 'on', tracerThickness: Number(f.get('c_tracerThickness') || 2), tracerVisibleOnly: f.get('c_tracerVisibleOnly') === 'on', chestFinderTypes: f.get('c_chestFinderTypes') || 'all', scaffoldDelayMs: Number(f.get('c_scaffoldDelayMs') || 100), scaffoldTower: f.get('c_scaffoldTower') === 'on', autoToolSwitchDelayMs: Number(f.get('c_autoToolSwitchDelayMs') ?? 100), autoToolPreferSilk: f.get('c_autoToolPreferSilk') === 'on', discordShowModules: f.get('c_discordShowModules') === 'on', chestStealerDelayMs: Number(f.get('c_chestStealerDelayMs') || 75), chestStealerValuableOnly: f.get('c_chestStealerValuableOnly') === 'on', antiFogMode: f.get('c_antiFogMode') || 'full', antiFogFactor: Number(f.get('c_antiFogFactor') || 4), chamsTint: f.get('c_chamsTint') === 'on', triggerbotTargets: f.get('c_triggerbotTargets') || 'hostile', triggerbotDelayMinMs: Number(f.get('c_triggerbotDelayMinMs') ?? 0), triggerbotDelayMaxMs: Number(f.get('c_triggerbotDelayMaxMs') ?? 80), hudActiveOnly: f.get('c_hudActiveOnly') === 'on',
      hudEnabled: f.get('c_hudEnabled') === 'on', showTps: f.get('c_showTps') === 'on',
      showFps: f.get('c_showFps') === 'on', showCps: f.get('c_showCps') === 'on', showPing: f.get('c_showPing') === 'on',
      showCoordinates: f.get('c_showCoordinates') === 'on', showBiome: f.get('c_showBiome') === 'on', showCompass: f.get('c_showCompass') === 'on',
      showArmor: f.get('c_showArmor') === 'on', showEffects: f.get('c_showEffects') === 'on', showSession: f.get('c_showSession') === 'on',
      xrayBlocks: f.get('c_xrayBlocks') || '',
    };
    for (const k of Object.keys(body)) if (k.startsWith('c_')) delete body[k];
    const { instance } = await api('/api/instances', { method: 'POST', body: JSON.stringify(body) });
    msg.innerHTML = '<span class="ok">Instance "' + esc(instance.name) + '" dibuat. Klik Install / Perbaiki untuk mengunduh.</span>'; loadInstances();
  } catch (e) { msg.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
});
$('#clientInstanceSelect').addEventListener('change', async () => {
  const { instances } = await api('/api/instances');
  const found = instances.find((i) => i.id === $('#clientInstanceSelect').value);
  if (found) fillClientForm(found);
});
$('#clientForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); const f = new FormData(ev.target); const msg = $('#clientMsg');
  const id = f.get('instanceId');
  if (!id) { msg.innerHTML = '<span class="err">Tidak ada instance PlumClient. Buat dulu dengan loader PlumClient (Minecraft 1.21.4).</span>'; return; }
  try {
    const client = readClientForm();
    await api(`/api/instances/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ client }) });
    msg.innerHTML = '<span class="ok">Tersimpan. Tekan Install/Perbaiki bila belum terpasang, lalu Play.</span>'; loadInstances();
  } catch (e) { msg.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
});
$('#importForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); const f = new FormData(ev.target); const msg = $('#importMsg');
  try {
    const r = await api('/api/instances/import', { method: 'POST', body: JSON.stringify(Object.fromEntries(f)) });
    msg.innerHTML = '<span class="ok">Impor selesai: ' + r.import.copied + ' berkas disalin ke instance aman terpisah.</span>'; loadInstances();
  } catch (e) { msg.innerHTML = '<span class="err">' + esc(e.message) + '</span>'; }
});

/* ---------- Diagnostik ---------- */
$('#runDiag').addEventListener('click', async () => {
  const out = $('#diagOut'); out.textContent = 'Memeriksa…';
  try { const d = await api('/api/diagnostics'); out.innerHTML = d.checks.map((c) => `<div class="vcard">${c.ok ? '✓' : '✗'} <strong>${esc(c.name)}</strong><br><small>${esc(c.detail)}</small></div>`).join(''); }
  catch (e) { out.textContent = e.message; }
});
$('#checkUpdate').addEventListener('click', async () => {
  try { const u = await api('/api/update'); alert(u.configured ? (u.updateAvailable ? `Update tersedia: ${u.latest}\n${u.notes || ''}\n${u.url || ''}` : 'Launcher sudah terbaru (' + u.current + ').') : u.detail); }
  catch (e) { alert(e.message); }
});

window.addEventListener('focus', () => { loadAccount(); });
loadAccount(); loadVersions();
