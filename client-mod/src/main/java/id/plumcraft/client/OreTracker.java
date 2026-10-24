package id.plumcraft.client;

import net.minecraft.block.Block;
import net.minecraft.client.MinecraftClient;
import net.minecraft.registry.Registries;
import net.minecraft.util.math.BlockPos;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.PriorityQueue;

/**
 * Pemindai ore Xray dalam radius terbatas.
 * Dipakai bersama oleh highlight partikel dan pelacak HUD supaya
 * pemindaian berat hanya dilakukan maksimal sekali per detik.
 */
public final class OreTracker {
    private static final long SCAN_INTERVAL_MS = 1000L;
    private static final int MAX_NEAREST = 256;

    private static long lastScanMillis;
    private static Object lastWorld;
    private static BlockPos lastOrigin;
    private static List<Entry> entries = List.of();

    private OreTracker() {
    }

    public record Entry(BlockPos pos, String label, double distance) {
    }

    public static synchronized List<BlockPos> highlightPositions(MinecraftClient client, PlumConfig cfg) {
        update(client, cfg);
        List<BlockPos> out = new ArrayList<>();
        int max = Math.max(1, Math.min(12, cfg.xrayMaxHighlights));
        for (int i = 0; i < Math.min(max, entries.size()); i++) {
            out.add(entries.get(i).pos());
        }
        return out;
    }

    public static synchronized List<String> trackerLines(MinecraftClient client, PlumConfig cfg) {
        update(client, cfg);
        List<String> out = new ArrayList<>();
        for (int i = 0; i < Math.min(3, entries.size()); i++) {
            Entry entry = entries.get(i);
            out.add("- " + entry.label() + " " + String.format(Locale.ROOT, "%.0fm", entry.distance())
                    + " (" + entry.pos().getX() + ", " + entry.pos().getY() + ", " + entry.pos().getZ() + ")");
        }
        return out;
    }

    public static synchronized boolean hasTargets(MinecraftClient client, PlumConfig cfg) {
        update(client, cfg);
        return !entries.isEmpty();
    }

    private static void update(MinecraftClient client, PlumConfig cfg) {
        long now = System.currentTimeMillis();
        if (client == null || client.world == null || client.player == null || cfg == null || !cfg.xrayEnabled) {
            entries = List.of();
            lastWorld = null;
            lastOrigin = null;
            return;
        }
        if (!cfg.xrayHighlight && !cfg.showOreTracker) {
            entries = List.of();
            lastWorld = client.world;
            lastOrigin = client.player.getBlockPos().toImmutable();
            lastScanMillis = now;
            return;
        }

        BlockPos origin = client.player.getBlockPos();
        boolean cacheFresh = client.world == lastWorld
                && lastOrigin != null
                && origin.getSquaredDistance(lastOrigin) <= 4.0D
                && now - lastScanMillis < SCAN_INTERVAL_MS;
        if (cacheFresh) {
            return;
        }
        lastScanMillis = now;
        lastWorld = client.world;
        lastOrigin = origin.toImmutable();

        int radius = Math.max(8, Math.min(32, cfg.xrayRadius));
        // Heap terbesar menyimpan kandidat terdekat saja; hasil akhir tetap akurat
        // tanpa harus menyimpan semua blok yang cocok di radius besar.
        PriorityQueue<Entry> nearest = new PriorityQueue<>(Comparator.comparingDouble(Entry::distance).reversed());
        double maxDistSq = (double) radius * (double) radius;
        for (BlockPos pos : BlockPos.iterate(origin.add(-radius, -radius, -radius), origin.add(radius, radius, radius))) {
            if (!client.world.isChunkLoaded(pos)) {
                continue;
            }
            double distSq = pos.getSquaredDistance(origin);
            if (distSq > maxDistSq) {
                continue;
            }
            Block block = client.world.getBlockState(pos).getBlock();
            if (!cfg.isXrayBlock(block)) {
                continue;
            }
            if (cfg.xrayExposedOnly && !isExposed(client, pos)) {
                continue;
            }
            String label = prettify(Registries.BLOCK.getId(block).toString());
            Entry entry = new Entry(pos.toImmutable(), label, Math.sqrt(distSq));
            if (nearest.size() < MAX_NEAREST) {
                nearest.offer(entry);
            } else if (!nearest.isEmpty() && entry.distance() < nearest.peek().distance()) {
                nearest.poll();
                nearest.offer(entry);
            }
        }
        List<Entry> found = new ArrayList<>(nearest);
        if (cfg.xrayValuableFirst) {
            found.sort(Comparator.comparingInt((Entry e) -> -valueTier(e.label())).thenComparingDouble(Entry::distance));
        } else {
            found.sort(Comparator.comparingDouble(Entry::distance));
        }
        entries = List.copyOf(found);
    }

    private static boolean isExposed(MinecraftClient client, BlockPos pos) {
        for (net.minecraft.util.math.Direction dir : net.minecraft.util.math.Direction.values()) {
            var state = client.world.getBlockState(pos.offset(dir));
            if (state.isAir() || state.isReplaceable()) return true;
        }
        return false;
    }

    private static int valueTier(String label) {
        if (label == null) return 0;
        if (label.contains("Ancient") || label.contains("Diamond")) return 5;
        if (label.contains("Emerald")) return 4;
        if (label.contains("Gold")) return 3;
        if (label.contains("Iron") || label.contains("Lapis") || label.contains("Redstone")) return 2;
        return 1;
    }

    private static String prettify(String id) {
        if (id == null || id.isEmpty()) {
            return "-";
        }
        String path = id.contains(":") ? id.substring(id.indexOf(':') + 1) : id;
        String[] parts = path.split("_");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                sb.append(part.substring(1));
            }
        }
        return sb.length() == 0 ? id : sb.toString();
    }
}
