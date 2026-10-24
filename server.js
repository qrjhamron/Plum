'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PATHS, ensureDirs } = require('./lib/store');
const auth = require('./lib/auth');
const { getManifest, getVersionMeta } = require('./lib/mojang');
const L = require('./lib/launcher');
const pkg = require('./package.json');

ensureDirs();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = type.startsWith('application/json') ? JSON.stringify(body) : body;
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1024 * 1024) { reject(new Error('Body terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON tidak valid')); } });
    req.on('error', reject);
  });
}
function fail(res, e) {
  const status = e.code === 'VALIDATION' ? 400 : e.code === 'VERSION_NOT_FOUND' ? 404 : e.code === 'MISSING_FILES' ? 409 : e.code === 'NO_LICENSE' ? 403 : e.code === 'ALREADY_RUNNING' ? 409 : 500;
  // Jangan pernah bocorkan token di pesan error
  send(res, status, { error: String(e.message || e).replace(/[A-Za-z0-9_-]{80,}/g, '[REDACTED]'), code: e.code || 'ERROR', errors: e.errors, missing: e.missing });
}
const findInst = (id) => L.loadInstances().find((i) => i.id === id);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    /* ---- Auth ---- */
    if (p === '/api/auth/status' && req.method === 'GET') {
      const session = auth.authConfigured() ? await auth.currentSession().catch(() => null) : null;
      return send(res, 200, { configured: auth.authConfigured(), clientIdHint: auth.authConfigured() ? auth.CLIENT_ID.slice(0, 8) + '…' : null, redirectUri: auth.REDIRECT_URI, loggedIn: !!session, profile: session ? session.profile : null });
    }
    if (p === '/api/auth/login-url' && req.method === 'GET') {
      if (!auth.authConfigured()) return send(res, 503, { error: 'MICROSOFT_CLIENT_ID belum diatur. Daftarkan Azure App (tenant consumers) lalu ajukan izin Minecraft API.', configured: false, redirectUri: auth.REDIRECT_URI, steps: ['portal.azure.com > App registrations > New registration (Personal Microsoft accounts)', 'Authentication > Add platform > Mobile and desktop applications > redirect URI: ' + auth.REDIRECT_URI, 'Ajukan izin API: https://aka.ms/mce-reviewappid', 'Set env MICROSOFT_CLIENT_ID=<Application (client) ID> lalu restart launcher'] });
      return send(res, 200, { url: auth.startLogin() });
    }
    if (p === '/auth/callback' && req.method === 'GET') {
      // Halaman callback OAuth sekali tampil di browser sistem; UI launcher sendiri hanya di jendela Tauri.
      const page = (title, body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;background:#171a21;color:#eef1f6;padding:40px"><h2>${title}</h2><p>${body}</p></body>`); };
      const err = url.searchParams.get('error');
      if (err) return page('Login dibatalkan', 'Kembali ke aplikasi PlumCraft Launcher dan coba lagi.');
      try { await auth.handleCallback(url.searchParams.get('code'), url.searchParams.get('state')); return page('Login berhasil', 'Kembali ke aplikasi PlumCraft Launcher. Tab ini boleh ditutup.'); }
      catch (e) { return page('Login gagal', String(e.message || e).replace(/[<>&]/g, '') + ' — kembali ke aplikasi PlumCraft Launcher.'); }
    }
    if (p === '/api/auth/logout' && req.method === 'POST') { auth.logout(); return send(res, 200, { ok: true }); }

    /* ---- Versions ---- */
    if (p === '/api/versions' && req.method === 'GET') {
      const man = await getManifest();
      const type = url.searchParams.get('type') || 'all';
      const q = (url.searchParams.get('q') || '').toLowerCase();
      let list = man.versions || [];
      if (type !== 'all') list = list.filter((v) => v.type === type);
      if (q) list = list.filter((v) => v.id.toLowerCase().includes(q));
      return send(res, 200, { latest: man.latest, total: list.length, versions: list.slice(0, 300).map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })) });
    }
    if (p.startsWith('/api/versions/') && req.method === 'GET') {
      const meta = await getVersionMeta(decodeURIComponent(p.slice('/api/versions/'.length)));
      return send(res, 200, { id: meta.id, type: meta.type, mainClass: meta.mainClass, javaVersion: meta.javaVersion, assetIndex: meta.assetIndex && meta.assetIndex.id, libraries: (meta.libraries || []).length });
    }

    /* ---- PlumClient ---- */
    if (p === '/api/client/status' && req.method === 'GET') {
      const jar = L.findPlumClientJar();
      return send(res, 200, {
        targetMinecraft: L.PLUMCLIENT_TARGET,
        jarBuilt: !!jar,
        jarPath: jar ? path.relative(path.join(__dirname), jar) : 'client-mod/build/libs/plumclient-1.0.0.jar',
        buildCommand: 'cd client-mod && gradle build',
        features: [
          { id: 'xray', name: 'Xray Advanced', hotkey: 'X', note: 'Filter ore plus preset kategori, highlight partikel, pelacak ore terdekat, opsi ore terbuka saja dan prioritas ore berharga.' },
          { id: 'autobright', name: 'AutoBright', hotkey: 'B', note: 'Fullbright lewat gamma 1-15 yang bisa diatur dengan transisi halus.' },
          { id: 'autoclick', name: 'AutoClick Advanced', hotkey: 'V', note: 'Cooldown-aware untuk entity, target attack/mining terpisah, proteksi durability, humanizer CPS attack/use sendiri-sendiri plus aim smooth + jitter.' },
          { id: 'tps', name: 'TPS', hotkey: 'H (HUD)', note: 'Estimasi TPS server dari paket waktu dunia, tampil di HUD bersama FPS/koordinat.' },
          { id: 'hud', name: 'HUD Tambahan', hotkey: 'H', note: 'CPS, ping, biome, kompas, durability armor, efek potion, dan waktu sesi. Tiap elemen bisa dimatikan dari panel PlumClient.' },
          { id: 'autoweapon', name: 'AutoWeapon', hotkey: 'Z', note: 'Pilih senjata melee terkuat (pedang/kapak/trident/mace) di hotbar saat membidik entity hidup dalam jangkauan.' },
          { id: 'autobow', name: 'AutoBow', hotkey: 'C', note: 'Tarik busur otomatis saat membidik entity hidup dan lepas saat charge penuh (atau 75% bila mode penuh mati), dalam jarak yang diatur.' },
          { id: 'nofall', name: 'NoFall', hotkey: 'N', note: 'Kirim paket onGround saat jatuh agar fall damage tidak terakumulasi. Hanya singleplayer/server yang mengizinkan.' },
          { id: 'stronghold', name: 'Stronghold Finder', hotkey: 'G', note: 'Triangulasi dua lemparan Eye of Ender yang terlihat client untuk estimasi koordinat stronghold; tanpa membaca seed/server.' },
          { id: 'crosshair', name: 'Crosshair Kustom', hotkey: 'K', note: 'Ganti crosshair vanilla: gaya cross/dot/circle/cross+dot, ukuran 4-20, 6 warna, dari panel PlumClient.' },
          { id: 'esp', name: 'ESP', hotkey: 'O', note: 'Outline menyala tembus dinding untuk entity pilihan (hostile/pemain/hewan/semua) dalam jarak 8-128.' },
          { id: 'tracers', name: 'Tracers', hotkey: 'P', note: 'Garis dari crosshair ke entity pilihan di layar, diproyeksikan dari posisi dunia.' },
          { id: 'chestfinder', name: 'Chest Finder', hotkey: 'U', note: 'Pindai chest, trapped chest, ender chest, barrel, dan shulker di chunk termuat; tandai partikel plus daftar HUD.' },
          { id: 'scaffold', name: 'Scaffold / AutoBuild', hotkey: 'Y', note: 'Pasang blok dari hotbar di bawah pemain saat berjalan di atas udara.' },
          { id: 'autotool', name: 'AutoTool', hotkey: 'R', note: 'Ganti tool tercepat untuk blok yang dibidik; untuk entity memakai senjata terbaik, mace diprioritaskan saat jatuh, trident (spear) di air/hujan.' },
          { id: 'discordrpc', name: 'Discord Rich Presence', hotkey: '-', note: 'Tampilkan status bermain di Discord lewat IPC lokal. Butuh Discord App ID sendiri dari Discord Developer Portal.' },
          { id: 'jesus', name: 'Jesus', hotkey: 'J', note: 'Berjalan di permukaan air/lava (bisa dipilih per cairan, daya angkat diatur) selama aktif dan tidak sneak.' },
          { id: 'cheststealer', name: 'Chest Stealer', hotkey: ',', note: 'Pindahkan isi kontainer yang dibuka ke inventory otomatis dengan jeda terkonfigurasi dan filter item berharga, lalu tutup.' },
          { id: 'antifog', name: 'AntiFog', hotkey: '.', note: 'Mode full menghilangkan kabut; mode partial mendorong jarak fog sejauh faktor yang diatur.' },
          { id: 'chams', name: 'Chams', hotkey: 'M', note: 'Model entity hidup digambar tanpa depth test (tembus dinding), opsi tint merah, memakai filter ESP.' },
          { id: 'triggerbot', name: 'Triggerbot', hotkey: '/', note: 'Attack saat crosshair mengenai target tersaring setelah delay reaksi acak dalam rentang yang diatur dan cooldown penuh.' },
          { id: 'killaura', name: 'KillAura Advanced', hotkey: 'I', note: 'Serang entity otomatis: prioritas jarak/health/sudut/hurtTime, mode single/switch/multi, aim prediktif dengan batas rotasi per tick, filter FOV/tim/invisible, smart-crit, sinkron cooldown + batas CPS.' },
          { id: 'velocity', name: 'Velocity Advanced', hotkey: 'L', note: 'Kurangi knockback per sumbu (horizontal/vertikal 0-100% atau cancel), tunda velocity beberapa tick, jump-reset acak, syarat sedang bergerak.' },
          { id: 'sprint', name: 'Sprint Advanced', hotkey: ';', note: 'Sprint otomatis mode legit (maju) atau omni (semua arah), keep-sprint setelah menyerang, hormati lapar/blindness/sneak/item.' },
          { id: 'autoarmor', name: 'AutoArmor Advanced', hotkey: "'", note: 'Pasang armor terbaik otomatis dari skor defense + toughness + enchantment berbobot per slot, jeda antar ganti, opsi hotbar saja, elytra, dan buang potongan lama.' },
          { id: 'freecam', name: 'Freecam Advanced', hotkey: 'F6', note: 'Kamera bebas lepas dari badan (mouse menggerakkan kamera, pemain bisa dibekukan di tempat), kecepatan diatur + boost sprint, badan pemain tetap terlihat.' },
          { id: 'clickgui', name: 'ClickGUI', hotkey: 'Right Shift', note: 'Panel modul in-game per kategori Combat/Movement/Player/Render/World dengan pencarian, scroll, dan toggle tersimpan otomatis.' },
          { id: 'criticals', name: 'Criticals Advanced', hotkey: 'F7', note: 'Lompatan mini/normal vanilla saat target dekat dan cooldown siap agar serangan berikutnya critical. Tanpa paket posisi palsu.' },
          { id: 'noslow', name: 'NoSlow Advanced', hotkey: 'F8', note: 'Pertahankan sprint dan kecepatan selama memakai item (makan/busur/perisai) dari input gerak pemain sendiri.' },
          { id: 'autototem', name: 'AutoTotem Advanced', hotkey: 'F9', note: 'Pindahkan totem ke offhand saat HP di bawah ambang atau selalu, satu swap per jeda.' },
          { id: 'trajectories', name: 'Trajectories Advanced', hotkey: 'F10', note: 'Simulasi lintasan proyektil busur/trident/lemparan dengan drag + gravitasi vanilla dan penanda titik benturan blok.' },
          { id: 'nametags', name: 'NameTags Advanced', hotkey: '[', note: 'Label nama + HP + jarak terproyeksi di atas entity tersaring, memakai cache entity bersama.' },
          { id: 'invmanager', name: 'InvManager Advanced', hotkey: ']', note: 'Rapikan senjata terbaik ke hotbar pertama dan buang duplikat gear lebih lemah satu aksi per jeda; item terenchant tidak dibuang.' },
          { id: 'autofish', name: 'AutoFish Advanced', hotkey: '-', note: 'Tarik joran saat bobber tenggelam mendadak di air, lempar lagi setelah jeda terkonfigurasi.' },
          { id: 'automine', name: 'AutoMine Advanced', hotkey: '=', note: 'Tahan mining vanilla pada blok crosshair dengan proteksi durability, tool otomatis, dan ore-assist ke highlight terdekat.' },
        ],
      });
    }

    /* ---- Instances ---- */
    if (p === '/api/instances' && req.method === 'GET') return send(res, 200, { instances: L.loadInstances().map((i) => ({ ...i, gameDir: L.gameDirOf(i), running: L.running.has(i.id) })) });
    if (p === '/api/instances' && req.method === 'POST') { const inst = await L.createInstance(await readBody(req)); return send(res, 201, { instance: { ...inst, gameDir: L.gameDirOf(inst) } }); }
    const mInst = p.match(/^\/api\/instances\/([^/]+)(\/(install|launch|stop|validate|logs))?$/);
    if (mInst) {
      const inst = findInst(decodeURIComponent(mInst[1]));
      if (!inst) return send(res, 404, { error: 'Instance tidak ditemukan' });
      const action = mInst[3];
      if (!action && req.method === 'GET') return send(res, 200, { instance: { ...inst, gameDir: L.gameDirOf(inst), running: L.running.has(inst.id) } });
      if (!action && req.method === 'PATCH') {
        const body = await readBody(req);
        const merged = { ...inst, ...body, name: body.name ?? inst.name, versionId: body.versionId ?? inst.versionId };
        const v = await L.validateInstanceInput(merged, { existingId: inst.id });
        Object.assign(inst, { name: v.name, versionId: v.versionId, ramMb: v.ramMb, width: v.width, height: v.height, javaPath: v.javaPath, jvmArgs: v.jvmArgs, loader: v.loader, loaderVersion: v.loaderVersion, client: v.client });
        L.saveInstances(L.loadInstances().map((i) => (i.id === inst.id ? inst : i)));
        if (inst.loader === 'plumclient') L.writeClientConfig(inst);
        return send(res, 200, { instance: inst });
      }
      if (!action && req.method === 'DELETE') {
        if (L.running.has(inst.id)) return send(res, 409, { error: 'Instance sedang berjalan, stop dulu.' });
        L.saveInstances(L.loadInstances().filter((i) => i.id !== inst.id));
        if (url.searchParams.get('files') === '1') fs.rmSync(path.dirname(L.gameDirOf(inst)), { recursive: true, force: true });
        return send(res, 200, { ok: true });
      }
      if (action === 'install' && req.method === 'POST') {
        const job = L.newJob('install', 'Install ' + inst.versionId);
        L.installInstance(inst, job).then(() => { job.status = 'done'; job.progress = 100; }).catch((e) => { job.status = 'error'; job.error = e.message; });
        return send(res, 202, { job });
      }
      if (action === 'validate' && req.method === 'GET') return send(res, 200, await L.validateInstance(inst));
      if (action === 'logs' && req.method === 'GET') { const rec = L.running.get(inst.id); return send(res, 200, { running: !!rec, logs: rec ? rec.logs : [], exitCode: rec ? rec.exitCode : null }); }
      if (action === 'stop' && req.method === 'POST') { const rec = L.running.get(inst.id); if (rec) rec.child.kill(); return send(res, 200, { ok: true, wasRunning: !!rec }); }
      if (action === 'launch' && req.method === 'POST') {
        const session = await auth.currentSession().catch(() => null);
        const forLaunch = session ? require('./lib/auth').accessForLaunch() : null;
        if (!forLaunch) return send(res, 401, { error: 'Login Microsoft dengan akun pemilik Minecraft: Java Edition diperlukan sebelum Play.', code: 'AUTH_REQUIRED', configured: auth.authConfigured() });
        const result = await L.launchInstance(inst, forLaunch);
        return send(res, 200, { ok: true, ...result });
      }
    }
    if (p === '/api/instances/import' && req.method === 'POST') {
      const body = await readBody(req);
      const inst = await L.createInstance(body);
      try { const result = L.importInstanceSync(body.sourcePath, inst); inst.installed = false; return send(res, 201, { instance: inst, import: result }); }
      catch (e) { L.saveInstances(L.loadInstances().filter((i) => i.id !== inst.id)); throw e; }
    }

    /* ---- Jobs / diagnostics / update ---- */
    if (p.startsWith('/api/jobs/') && req.method === 'GET') { const job = L.jobs.get(p.slice('/api/jobs/'.length)); return job ? send(res, 200, { job }) : send(res, 404, { error: 'Job tidak ditemukan' }); }
    if (p === '/api/diagnostics' && req.method === 'GET') {
      const checks = [];
      try { const man = await getManifest(); checks.push({ name: 'Manifest Mojang (piston-meta)', ok: true, detail: (man.versions || []).length + ' versi, latest release ' + (man.latest && man.latest.release) }); } catch (e) { checks.push({ name: 'Manifest Mojang (piston-meta)', ok: false, detail: e.message }); }
      try { const st = fs.statfsSync(PATHS.data); checks.push({ name: 'Ruang disk data', ok: st.bavail * st.bsize > 2 * 1024 ** 3, detail: Math.round(st.bavail * st.bsize / 1024 ** 3) + ' GB bebas di ' + PATHS.data }); } catch (e) { checks.push({ name: 'Ruang disk data', ok: false, detail: e.message }); }
      try { fs.accessSync(PATHS.data, fs.constants.W_OK); checks.push({ name: 'Folder data bisa ditulis', ok: true, detail: PATHS.data }); } catch { checks.push({ name: 'Folder data bisa ditulis', ok: false, detail: PATHS.data }); }
      const javas = await L.systemJavaCandidates();
      checks.push({ name: 'Java sistem terdeteksi', ok: javas.length > 0, detail: javas.length ? javas.map((j) => `Java ${j.major} (${j.path})`).join('; ') : 'Tidak ada. Launcher akan mengunduh runtime resmi Mojang saat Install.' });
      const plumJar = L.findPlumClientJar();
      checks.push({ name: 'PlumClient JAR (Xray/AutoBright/AutoClick/TPS)', ok: !!plumJar, detail: plumJar || 'Belum dibangun. Jalankan: cd client-mod && gradle build' });
      checks.push({ name: 'Login Microsoft terkonfigurasi', ok: auth.authConfigured(), detail: auth.authConfigured() ? 'MICROSOFT_CLIENT_ID terpasang' : 'Set MICROSOFT_CLIENT_ID (lihat panel Akun)' });
      checks.push({ name: 'Sistem', ok: true, detail: `${os.platform()} ${os.arch()} • Node ${process.version} • RAM ${Math.round(os.totalmem() / 1024 ** 3)} GB` });
      return send(res, 200, { ok: checks.every((c) => c.ok || c.name.startsWith('Java sistem') || c.name.startsWith('Login') || c.name.startsWith('PlumClient JAR')), version: pkg.version, checks });
    }
    if (p === '/api/update' && req.method === 'GET') {
      const updateUrl = process.env.LAUNCHER_UPDATE_URL;
      if (!updateUrl) return send(res, 200, { configured: false, current: pkg.version, detail: 'Set LAUNCHER_UPDATE_URL ke JSON {version,url,notes} untuk cek update.' });
      try { const r = await fetch(updateUrl, { signal: AbortSignal.timeout(10000) }); const info = await r.json(); const cmp = String(info.version).localeCompare(pkg.version, undefined, { numeric: true }); return send(res, 200, { configured: true, current: pkg.version, latest: info.version, updateAvailable: cmp > 0, url: info.url, notes: info.notes }); }
      catch (e) { return send(res, 200, { configured: true, current: pkg.version, error: e.message }); }
    }

    // Engine API-only: tidak ada UI browser. Antarmuka dirender jendela desktop Tauri.
    return send(res, 404, { error: 'Tidak ditemukan: ' + p });
  } catch (e) { return fail(res, e); }
});

server.listen(PORT, HOST, () => {
  console.log(`PlumCraft engine v${pkg.version} (API-only, internal Tauri) di http://${HOST}:${PORT}`);
  console.log(auth.authConfigured() ? 'Login Microsoft: terkonfigurasi' : 'Login Microsoft: MICROSOFT_CLIENT_ID belum diatur (lihat panel Akun di aplikasi)');
});
