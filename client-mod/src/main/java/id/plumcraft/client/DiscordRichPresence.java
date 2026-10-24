package id.plumcraft.client;

import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;

import java.io.File;
import java.io.RandomAccessFile;
import java.net.StandardProtocolFamily;
import java.net.UnixDomainSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;

/**
 * Discord Rich Presence lewat IPC lokal Discord (tanpa library tambahan).
 * Memakai Unix domain socket (Linux/macOS) atau named pipe (Windows).
 * Butuh Discord App ID milik pengguna dari Discord Developer Portal.
 * Semua kegagalan diam: Discord tidak berjalan tidak boleh mengganggu game.
 */
public final class DiscordRichPresence {
    private static volatile boolean wanted;
    private static volatile String appId = "";
    private static volatile String details = "";
    private static volatile String state = "";
    private static volatile long sessionStartEpochSec;
    private static volatile boolean workerStarted;
    private static SocketChannel unixChannel;
    private static FileChannel pipeChannel;
    private static long lastSentMillis;
    private static String lastSentJson = "";

    private DiscordRichPresence() {
    }

    public static synchronized void tick(MinecraftClient client, PlumConfig cfg) {
        boolean enable = cfg != null && cfg.discordRpcEnabled && cfg.discordAppId != null
                && cfg.discordAppId.trim().matches("\\d{17,20}");
        if (!enable || client == null || client.player == null || client.world == null) {
            if (wanted) {
                wanted = false;
                details = "";
                state = "";
            }
            return;
        }
        appId = cfg.discordAppId.trim();
        details = "Minecraft 1.21.4 - PlumClient";
        if (client.isInSingleplayer()) {
            state = "Singleplayer - " + dimension(client);
        } else if (client.getCurrentServerEntry() != null) {
            state = "Multiplayer - " + client.getCurrentServerEntry().address;
        } else {
            state = "Multiplayer - " + dimension(client);
        }
        if (cfg.discordShowModules) {
            state += " - " + activeModuleCount(cfg) + " modul aktif";
        }
        long elapsed = PlumClientMod.sessionElapsedMillis();
        sessionStartEpochSec = (System.currentTimeMillis() - elapsed) / 1000L;
        wanted = true;
        if (!workerStarted) {
            workerStarted = true;
            Thread t = new Thread(DiscordRichPresence::workerLoop, "PlumClient-DiscordRPC");
            t.setDaemon(true);
            t.start();
        }
    }

    private static int activeModuleCount(PlumConfig cfg) {
        int n = 0;
        boolean[] flags = {cfg.xrayEnabled, cfg.autoBrightEnabled, cfg.autoClickEnabled, cfg.autoWeaponEnabled,
                cfg.autoBowEnabled, cfg.noFallEnabled, cfg.strongholdFinderEnabled, cfg.crosshairEnabled,
                cfg.espEnabled, cfg.tracersEnabled, cfg.chestFinderEnabled, cfg.scaffoldEnabled,
                cfg.autoToolEnabled, cfg.jesusEnabled, cfg.chestStealerEnabled, cfg.antiFogEnabled,
                cfg.chamsEnabled, cfg.triggerbotEnabled, cfg.killAuraEnabled, cfg.velocityEnabled,
                cfg.sprintEnabled, cfg.autoArmorEnabled, cfg.freecamEnabled, cfg.criticalsEnabled,
                cfg.noSlowEnabled, cfg.autoTotemEnabled, cfg.trajectoriesEnabled, cfg.nameTagsEnabled,
                cfg.invManagerEnabled, cfg.autoFishEnabled, cfg.autoMineEnabled};
        for (boolean f : flags) if (f) n++;
        return n;
    }

    private static String dimension(MinecraftClient client) {
        try {
            return client.world.getRegistryKey().getValue().getPath();
        } catch (Exception ignored) {
            return "overworld";
        }
    }

    private static void workerLoop() {
        while (true) {
            try {
                if (!wanted || appId.isEmpty()) {
                    closeConnection();
                    lastSentJson = "";
                    Thread.sleep(2000L);
                    continue;
                }
                if (!isConnected()) {
                    if (!connectAndHandshake()) {
                        Thread.sleep(10000L);
                        continue;
                    }
                    lastSentJson = "";
                }
                String activity = buildActivityJson();
                long now = System.currentTimeMillis();
                if (!activity.equals(lastSentJson) || now - lastSentMillis > 15000L) {
                    sendFrame(1, activity);
                    lastSentJson = activity;
                    lastSentMillis = now;
                }
                Thread.sleep(2000L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception ignored) {
                closeConnection();
                try { Thread.sleep(5000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            }
        }
    }

    private static String buildActivityJson() {
        JsonObject activity = new JsonObject();
        activity.addProperty("details", details);
        activity.addProperty("state", state);
        activity.addProperty("type", 0);
        if (sessionStartEpochSec > 0) {
            JsonObject ts = new JsonObject();
            ts.addProperty("start", sessionStartEpochSec);
            activity.add("timestamps", ts);
        }
        JsonObject root = new JsonObject();
        root.addProperty("cmd", "SET_ACTIVITY");
        JsonObject args = new JsonObject();
        args.addProperty("pid", ProcessHandle.current().pid());
        args.add("activity", activity);
        root.add("args", args);
        root.addProperty("nonce", String.valueOf(System.nanoTime()));
        return root.toString();
    }

    private static boolean isConnected() {
        return (unixChannel != null && unixChannel.isOpen()) || (pipeChannel != null && pipeChannel.isOpen());
    }

    private static boolean connectAndHandshake() {
        String id = appId;
        if (id == null || id.isEmpty()) return false;
        // Unix socket: $XDG_RUNTIME_DIR/discord-ipc-N, /tmp/discord-ipc-N
        String runtime = System.getenv("XDG_RUNTIME_DIR");
        String[] dirs = {runtime, "/tmp", System.getenv("TMPDIR")};
        for (String dir : dirs) {
            if (dir == null || dir.isEmpty()) continue;
            for (int i = 0; i < 10; i++) {
                File f = new File(dir, "discord-ipc-" + i);
                if (!f.exists()) continue;
                try {
                    SocketChannel ch = SocketChannel.open(StandardProtocolFamily.UNIX);
                    ch.connect(UnixDomainSocketAddress.of(f.toPath()));
                    unixChannel = ch;
                    if (handshake(id)) return true;
                    closeConnection();
                } catch (Exception ignored) {
                    closeConnection();
                }
            }
        }
        // Windows named pipe
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
            for (int i = 0; i < 10; i++) {
                try {
                    RandomAccessFile raf = new RandomAccessFile("\\\\.\\pipe\\discord-ipc-" + i, "rw");
                    pipeChannel = raf.getChannel();
                    if (handshake(id)) return true;
                    closeConnection();
                } catch (Exception ignored) {
                    closeConnection();
                }
            }
        }
        return false;
    }

    private static boolean handshake(String clientId) throws Exception {
        JsonObject hs = new JsonObject();
        hs.addProperty("v", 1);
        hs.addProperty("client_id", clientId);
        sendFrame(0, hs.toString());
        String response = readFramePayload();
        return response != null && response.contains("READY");
    }

    private static synchronized void sendFrame(int opcode, String json) throws Exception {
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        ByteBuffer buf = ByteBuffer.allocate(8 + payload.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.putInt(opcode);
        buf.putInt(payload.length);
        buf.put(payload);
        buf.flip();
        if (unixChannel != null) {
            while (buf.hasRemaining()) unixChannel.write(buf);
        } else if (pipeChannel != null) {
            while (buf.hasRemaining()) pipeChannel.write(buf);
        } else {
            throw new IllegalStateException("not connected");
        }
    }

    private static synchronized String readFramePayload() throws Exception {
        ByteBuffer header = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        if (!readFully(header)) return null;
        header.flip();
        header.getInt();
        int len = header.getInt();
        if (len <= 0 || len > 65536) return null;
        ByteBuffer body = ByteBuffer.allocate(len);
        if (!readFully(body)) return null;
        return new String(body.array(), StandardCharsets.UTF_8);
    }

    private static boolean readFully(ByteBuffer buf) throws Exception {
        while (buf.hasRemaining()) {
            int n;
            if (unixChannel != null) n = unixChannel.read(buf);
            else if (pipeChannel != null) n = pipeChannel.read(buf);
            else return false;
            if (n < 0) return false;
        }
        return true;
    }

    private static synchronized void closeConnection() {
        try { if (unixChannel != null) unixChannel.close(); } catch (Exception ignored) { }
        try { if (pipeChannel != null) pipeChannel.close(); } catch (Exception ignored) { }
        unixChannel = null;
        pipeChannel = null;
    }
}
