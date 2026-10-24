# PlumCraft Launcher

Launcher **Minecraft: Java Edition** untuk **Windows** berbasis **Tauri** (jendela desktop enteng, tanpa UI browser) dengan login Microsoft resmi, unduhan terverifikasi dari Mojang, instance terisolasi, dan launch game asli. Tanpa mode bajakan: Play wajib akun Microsoft pemilik Java Edition.

## Menjalankan (Windows, Tauri)

Launcher adalah aplikasi desktop Tauri: UI dirender WebView2 bawaan Windows di jendela aplikasi, bukan tab browser. `server.js` sekarang hanya engine API internal (API-only di `127.0.0.1:4173`) yang dijalankan otomatis oleh aplikasi Tauri dan tidak pernah dibuka manual; tidak ada lagi mode browser.

Prasyarat build di Windows: Node.js >= 20, Rust (rustup), Microsoft C++ Build Tools, dan WebView2 Runtime (umumnya sudah ada di Windows 11).

```powershell
cd C:\path\ke\client
npm install
.\scripts\prepare-engine.ps1   # unduh node.exe + siapkan bundle engine
npm run desktop:build          # hasil installer NSIS di src-tauri\target\release\bundle\nsis\
```

Untuk pengembangan: `npm run desktop` (mode dev memakai `node server.js` dari PATH). Ikon aplikasi ada di `src-tauri/icons`.

Catatan ukuran: shell Tauri/WebView2 jauh lebih enteng daripada Electron. Paket installer masih membawa runtime Node untuk engine launcher (logika Mojang/auth/launch yang sudah teruji), jadi ukuran total bukan sekecil aplikasi Tauri murni; menulis ulang engine ke Rust adalah langkah lanjutan bila ukuran paket harus sekecil mungkin.

## Mengaktifkan login Microsoft (wajib untuk Play)

1. [Azure Portal](https://portal.azure.com) > App registrations > New registration — dukung **Personal Microsoft accounts** (tenant `consumers`).
2. Authentication > Add a platform > **Mobile and desktop applications** > redirect URI: `http://localhost:4173/auth/callback`.
3. Ajukan izin memakai Minecraft API lewat form resmi: https://aka.ms/mce-reviewappid — tanpa persetujuan ini `api.minecraftservices.com` menjawab 403.
4. Jalankan aplikasi dengan client ID aplikasi (mode dev):

```powershell
$env:MICROSOFT_CLIENT_ID = "<Application (client) ID>"
npm run desktop
```

Untuk paket terpasang, atur env `MICROSOFT_CLIENT_ID` di Windows sebelum membuka aplikasi. Login dibuka di browser sistem hanya untuk halaman Microsoft, lalu kembali ke jendela aplikasi.

Alur login: Microsoft OAuth2 (PKCE, scope `XboxLive.signin offline_access`) -> Xbox Live -> XSTS -> Minecraft Services. Launcher mengecek entitlements (`product_minecraft`/`game_minecraft`) dan profil sebelum Play aktif. Refresh token dan token Minecraft tersimpan terenkripsi AES-256-GCM di `data/vault.enc` (kunci `0600`), tidak pernah dikirim ke UI atau ditulis ke log.

## Cara pakai

1. Tab **Versi**: telusuri release/snapshot dari `version_manifest_v2.json` Mojang (live, dengan cache offline).
2. **Buat instance + Install**: membuat instance terisolasi lalu mengunduh client, libraries, dan assets (semua diverifikasi SHA-1, unduhan bisa dilanjutkan dari `.part`), mengekstrak natives, dan menyediakan Java (runtime resmi Mojang sesuai `javaVersion` versi tersebut, atau Java sistem yang cocok).
3. Tab **Instance Saya**: atur nama/versi/RAM (512 MB s/d 80% RAM sistem)/resolusi/Java/JVM args, impor salinan `.minecraft` lama, validasi file, Play, Stop, dan lihat log game.
4. Tab **Diagnostik**: cek manifest, disk, Java, konfigurasi login, dan update launcher (`LAUNCHER_UPDATE_URL` menunjuk JSON `{version,url,notes}`).

Data tersimpan di `./data` (ganti dengan `LAUNCHER_DATA_DIR`). Folder bersama `versions/`, `libraries/`, `assets/`, `runtime/` dipakai ulang antar-instance; saves/mods tiap instance terpisah di `instances/<id>/game`.

## PlumClient (Xray, AutoBright, AutoClick, AutoWeapon, AutoBow, NoFall, Stronghold Finder, Crosshair, ESP, Tracers, Chest Finder, Scaffold, AutoTool, Discord RPC, Jesus, Chest Stealer, AntiFog, Chams, Triggerbot, KillAura, Velocity, Sprint, AutoArmor, Freecam, ClickGUI, Criticals, NoSlow, AutoTotem, Trajectories, NameTags, InvManager, AutoFish, AutoMine, TPS)

PlumClient adalah Fabric mod client-side untuk **Minecraft 1.21.4** di folder `client-mod/`. Launcher memasangnya sebagai loader `plumclient`: Fabric Loader diambil dari Meta Fabric resmi, libraries digabung dengan vanilla, JAR PlumClient disalin ke `mods/`, dan pengaturan ditulis ke `config/plumclient.json` tiap instance.

Build JAR sekali (butuh JDK 21 dan Gradle):

```bash
cd client-mod && gradle build
# hasil: client-mod/build/libs/plumclient-1.0.0.jar
```

Lalu di launcher: buat instance versi `1.21.4` dengan loader **PlumClient**, klik **Install / Perbaiki**, atur fitur di panel PlumClient, lalu **Play**. Semua fitur juga bisa dinyalakan/dimatikan tanpa hotkey dari bagian **Toggle cepat (tanpa hotkey)** di panel PlumClient launcher (klik chip ON/OFF); mod memuat ulang `config/plumclient.json` otomatis tiap ±1 detik, jadi toggle berlaku live saat game berjalan atau saat Play berikutnya. Di dalam game:

| Hotkey | Fitur |
| --- | --- |
| `X` | Xray Advanced — filter ore, preset kategori, highlight partikel, dan pelacak ore terdekat |
| `B` | AutoBright — fullbright (gamma) |
| `V` | AutoClick Advanced — cooldown-aware, target attack/mining terpisah, proteksi durability, humanizer CPS acak 8-14 + aim smooth/jitter |
| `H` | HUD — status modul dan HUD Tambahan |
| `Z` | AutoWeapon — pilih senjata melee terkuat di hotbar saat membidik entity hidup |
| `C` | AutoBow — tarik busur otomatis dan lepas saat charge penuh |
| `N` | NoFall — tanpa fall damage saat jatuh |
| `G` | Stronghold Finder — triangulasi Eye of Ender |
| `K` | Crosshair — crosshair kustom (gaya/ukuran/warna dari launcher) |
| `O` | ESP — outline entity tembus dinding |
| `P` | Tracers — garis dari crosshair ke entity |
| `U` | Chest Finder — tandai chest/barrel/shulker terdekat |
| `Y` | Scaffold/AutoBuild — pasang blok di bawah saat berjalan |
| `R` | AutoTool — tool blok tercepat + mace saat jatuh / trident di air |
| `J` | Jesus — berjalan di permukaan air/lava |
| `,` | Chest Stealer — sedot isi chest yang dibuka ke inventory |
| `.` | AntiFog — hilangkan kabut |
| `M` | Chams — model entity tembus dinding |
| `/` | Triggerbot — attack otomatis saat membidik entity |
| `Right Shift` | ClickGUI — panel modul in-game per kategori + pencarian |
| `F7` | Criticals Advanced — lompatan vanilla agar serangan berikutnya critical |
| `F8` | NoSlow Advanced — tetap cepat saat memakai item |
| `F9` | AutoTotem Advanced — totem ke offhand saat HP menipis |
| `F10` | Trajectories Advanced — lintasan proyektil terprediksi |
| `[` | NameTags Advanced — label nama/HP/jarak entity |
| `]` | InvManager Advanced — rapikan + buang duplikat gear lemah |
| `-` | AutoFish Advanced — tarik/lempar joran otomatis |
| `=` | AutoMine Advanced — mining blok crosshair otomatis |
| `I` | KillAura Advanced — serang entity otomatis dengan aim prediktif |
| `L` | Velocity Advanced — kurangi/tunda knockback per sumbu |
| `;` | Sprint Advanced — sprint otomatis legit/omni + keep-sprint |
| `'` | AutoArmor Advanced — pasang armor terbaik otomatis |
| `F6` | Freecam Advanced — kamera bebas, pemain bisa dibekukan |

Xray Advanced memakai preset kategori (`precious`, `redstone`, `nether`, `semua ore`) atau daftar custom, lalu menandai ore terdekat dalam radius 8-32 blok dengan partikel dan daftar HUD berisi nama, jarak, dan koordinat. Pemindaian dibatasi maksimal sekali per detik dan maksimal 12 highlight.

Autoclicker Advanced memakai humanizer: tiap klik memakai CPS acak dalam rentang yang dikonfigurasi (default 8–14), arah pandang diinterpolasi smooth ke target entity dengan jitter kecil (default ±1,0°) sebelum klik, bukan snap instan. Humanizer, smooth aim, dan jitter masing-masing bisa dimatikan dari panel PlumClient (humanizer mati = interval CPS tetap). Mode `entity` hanya menyerang entity, mode `block` hanya mining blok, dan mode `either` memilih attack atau mining berdasarkan target crosshair yang valid; tidak ada ayunan attack kosong ke udara. Untuk target entity, klik menunggu cooldown senjata penuh; mining ke blok tidak menunggu cooldown combat dan tidak memanggil ulang serangan saat blok yang sama sedang dalam proses dihancurkan. Proteksi berhenti bila GUI terbuka, pemain mati/spectator, target tidak cocok, blok survival tidak bisa dihancurkan, atau durability tool utama tersisa di bawah batas.

HUD Tambahan (semua bisa dimatikan satu per satu dari panel PlumClient di launcher): FPS, TPS, CPS kiri/kanan dari aksi attack/use yang benar-benar dijalankan game (termasuk hasil AutoClick), ping (`Lokal` di singleplayer), koordinat, biome, kompas arah pandang, durability armor yang dipakai, efek potion aktif beserta sisa durasinya, dan lama sesi bermain sejak masuk world. Armor dan efek hanya tampil bila ada isinya, dengan latar gelap tipis supaya tetap terbaca.

AutoWeapon menilai pedang/kapak/trident/mace di hotbar dari atribut attack damage dan attack speed bawaan item (enchantment memberi bonus kecil), lalu memilih yang terkuat hanya saat crosshair mengenai entity hidup dalam jarak 5 blok dan pemain tidak sedang memakai item lain. AutoBow hanya bekerja dengan busur di tangan utama: busur ditarik otomatis saat membidik entity hidup dalam jarak yang diatur (8-64, default 32) dan dilepas saat charge penuh, atau pada 75% bila mode charge penuh dimatikan; busur yang ditarik manual tidak diganggu, dan tembakan berhenti tanpa anak panah (kecuali mode kreatif). NoFall mengirim paket `onGround` berkala saat benar-benar jatuh agar fall damage tidak terakumulasi; ia tidak bekerja saat terbang, elytra, di air/lava, atau mode kreatif/spectator. Stronghold Finder mencatat posisi dan arah terbang Eye of Ender yang terlihat client (maksimal titik asal berjauhan >8 blok), lalu mengestimasi stronghold dari perpotongan dua garis arah di bidang XZ; hasil adalah estimasi triangulasi, bukan pembacaan seed, data server, atau struktur dunia, dan butuh minimal dua lemparan dari tempat berjauhan. Crosshair kustom menggantikan crosshair vanilla pada pandangan orang pertama dengan gaya `cross`, `dot`, `circle`, atau `crossdot`, ukuran 4-20, dan 6 pilihan warna.

ESP menyalakan outline glowing vanilla secara client-side untuk entity pilihan (`hostile`, `players`, `creatures`, `all`) dalam jarak 8-128 dan mematikannya lagi pada entity yang dinyalakan mod (glow asli dari efek/spectral arrow tidak dicabut). Tracers memproyeksikan posisi entity ke layar dari posisi mata dan arah pandang pemain, lalu menggambar garis putus dari crosshair; entity di belakang kamera dilewati. Chest Finder memindai chest, trapped chest, ender chest, barrel, dan shulker box di chunk termuat dalam radius 8-64 (pindai maks sekali/detik), menandai yang terdekat dengan partikel hijau dan daftar HUD. Scaffold/AutoBuild memasang blok pertama dari hotbar di bawah pemain saat berjalan di atas udara (maks ~10x/detik, butuh tetangga padat untuk menempel, nonaktif di creative/terbang/elytra). AutoTool memilih tool dengan `getMiningSpeedMultiplier`/`isSuitableFor` terbaik untuk blok yang dibidik; untuk entity, jalur AutoWeapon dipakai dengan bonus situasional: mace diprioritaskan saat jatuh kencang (velocity Y < -0.5 dan fallDistance >= 1.5) dan trident (spear) saat pemain di air/hujan — di Minecraft 1.21.4 belum ada item spear terpisah, jadi spear diwakili trident. Discord Rich Presence berbicara ke Discord desktop lewat IPC lokal (Unix socket `discord-ipc-*` di Linux/macOS, named pipe di Windows) tanpa library tambahan; butuh Discord App ID sendiri (17-20 digit) dari Discord Developer Portal, dan diam total bila Discord tidak berjalan atau App ID kosong.

Jesus menahan pemain di permukaan air/lava selama tidak sneak (mati di creative/terbang/elytra). Chest Stealer memindahkan isi kontainer `GENERIC_9X3/9X6`, shulker, dan hopper yang dibuka ke inventory dengan shift-klik (~13x/detik) lalu menutup layar bila sudah kosong. AntiFog mengganti hasil `BackgroundRenderer.applyFog` dengan fog berjarak 9999-10000 selama aktif. Chams menggambar model semua entity hidup tanpa depth test selama aktif (memakai filter target/jarak ESP untuk outline pendampingnya). Triggerbot mengirim satu attack hanya saat crosshair mengenai entity hidup dan cooldown senjata penuh, tanpa perlu menahan tombol.

ClickGUI in-game (Right Shift) menampilkan panel kategori Combat/Movement/Player/Render/World dengan pencarian modul, scroll, dan toggle beranimasi yang langsung menyimpan `plumclient.json`, sinkron dua arah dengan panel launcher. Delapan modul Advanced baru (paritas perilaku dengan kategori LiquidBounce, ditulis ulang bersih mengikuti pola PlumClient; berjalan di singleplayer maupun multiplayer pada server yang mengizinkan): Criticals melakukan lompatan mini/normal vanilla saat target dekat dan cooldown siap — tanpa paket posisi palsu. NoSlow mempertahankan sprint dan kecepatan horizontal selama memakai item dari input gerak pemain sendiri. AutoTotem memindahkan totem ke offhand saat HP di bawah ambang terkonfigurasi atau selalu, satu swap per jeda. Trajectories mensimulasikan drag + gravitasi proyektil vanilla busur/trident/snowball/egg/ender pearl sampai titik benturan blok. NameTags menggambar label nama + HP + jarak terproyeksi untuk entity tersaring. InvManager merapikan senjata terbaik ke hotbar pertama dan membuang duplikat gear yang jelas lebih lemah satu aksi per jeda, tanpa pernah membuang item terenchant. AutoFish menarik joran saat bobber tenggelam mendadak di air dan melempar lagi setelah jeda. AutoMine menahan mining vanilla pada blok crosshair dengan proteksi durability dan putaran ore-assist ke highlight terdekat, melepas tombol attack paksa saat target hilang/GUI terbuka/modul mati. Optimasi in-game: KillAura, ESP, Tracers, bar HP ESP, dan NameTags kini berbagi satu snapshot entity hidup (`EntityCache`, interval 25-250 ms terkonfigurasi) alih-alih mengiterasi `world.getEntities()` berulang tiap modul dan tiap frame render. Panel launcher kini punya pencarian setting di kedua form, quick-toggle untuk modul baru, tombol simpan sticky, dan highlight fokus. Launcher tetap hanya mendukung akun Microsoft resmi pemilik Java Edition untuk Play di singleplayer maupun multiplayer; tidak ada dukungan launcher bajakan/offline dan tidak ada fitur penghindar deteksi server — pakai modul hanya di world sendiri atau server yang secara eksplisit mengizinkan.

Upgrade Advanced modul lama (paritas perilaku dengan kategori LiquidBounce, ditulis ulang bersih mengikuti pola PlumClient; berjalan di singleplayer maupun multiplayer pada server yang mengizinkan): Jesus bisa dipilih per cairan (air/lava) dengan daya angkat terkonfigurasi. Xray pelacak bisa dibatasi ke ore terbuka yang menyentuh udara dan mengutamakan ore berharga (ancient debris/diamond/emerald) sebelum jarak. AutoBright memakai gamma 1-15 terkonfigurasi dengan transisi halus. AutoClick attack dan use kini punya timer serta rentang CPS humanizer sendiri-sendiri sehingga mode both tidak saling memblokir. AutoWeapon menimbang enchantment per jenis (sharpness/smite/fire aspect/dll) dan punya jeda ganti senjata; AutoTool punya jeda ganti tool dan preferensi silk touch. AutoBow memakai aim prediktif yang memimpin target bergerak saat busur ditarik. NoFall punya ambang jarak jatuh dan interval paket terkonfigurasi. Stronghold Finder memakai jarak minimum antar lemparan terkonfigurasi. Crosshair bisa dinamis mengikuti cooldown dan berubah merah saat membidik entity hidup. ESP bisa menggambar bar HP terproyeksi; Tracers punya ketebalan garis dan filter garis pandang. Chest Finder bisa dibatasi ke chest/barrel/shulker saja. Scaffold punya jeda pasang terkonfigurasi dan mode tower saat menahan lompat. Discord RPC bisa menampilkan jumlah modul aktif. Chest Stealer punya jeda terkonfigurasi dan mode hanya item berharga (terenchant atau tier diamond/netherite/emerald/elytra/totem/dll). AntiFog mode partial mendorong jarak fog sejauh faktor terkonfigurasi selain mode full. Chams punya opsi tint merah. Triggerbot menyaring target per kategori dan menunggu delay reaksi acak dalam rentang terkonfigurasi sebelum menyerang. HUD punya mode ringkas yang hanya mencantumkan modul aktif.

Lima modul Advanced (terinspirasi kategori LiquidBounce, ditulis ulang bersih mengikuti pola PlumClient; hanya untuk singleplayer, world sendiri, atau server yang mengizinkan): KillAura memilih target dalam jarak pindai terpisah dari jarak serang, dengan prioritas jarak/health/sudut/hurt-time, mode single (fokus), switch (berganti tiap jeda), atau multi (bergiliran tiap serangan), filter FOV, rekan tim, dan entity invisible, aim prediktif (posisi + velocity target) yang dibatasi derajat per tick, cek garis pandang kecuali mode tembus dinding, sinkron cooldown plus batas CPS, dan smart-crit yang menunda serangan saat pemain masih naik di udara. Velocity menskala knockback paket per sumbu horizontal/vertikal (mode reduce 0-100% atau cancel), bisa menunda velocity 0-10 tick sebelum diterapkan, menjalankan jump-reset dengan peluang terkonfigurasi, dan bisa disyaratkan hanya saat pemain bergerak; paket velocity entity lain diabaikan. Sprint mode legit hanya sprint saat maju, mode omni untuk semua arah, dengan keep-sprint yang ditegaskan ulang tiap tick, dan berhenti saat lapar (food <= 6), blindness, sneak, atau memakai item kecuali opsi sprint-saat-pakai-item menyala. AutoArmor menilai tiap potongan dari atribut armor + toughness data komponen 1.21.4 ditambah bobot enchantment per slot (protection, feather falling, respiration, dan lain-lain), mengganti maksimal satu potongan per jeda dari inventory penuh atau hotbar saja, menghormati elytra yang masih layak (diprioritaskan atau diganti chestplate sesuai opsi), dan menyimpan atau membuang potongan lama sesuai opsi. Freecam melepaskan kamera dari badan: mouse memutar kamera bebas (bukan badan pemain), WASD/jump/sneak menerbangkan kamera dengan kecepatan terkonfigurasi dan boost sprint, pemain bisa dibekukan di titik aktivasi, badan pemain ditampilkan lewat perspektif orang ketiga yang dipulihkan saat Freecam mati, dan kamera kembali mengikuti pemain saat modul dimatikan atau dunia berganti.


## Test

```bash
npm test
```

## Catatan

- Hanya Java Edition; Bedrock tidak didukung.
- Unduhan runtime/assets bisa besar (ratusan MB) pada Install pertama.
- Anak di bawah umur mungkin perlu persetujuan Xbox Family; akun tanpa profil Xbox perlu membuka xbox.com sekali.
