package id.plumcraft.client;

import net.minecraft.block.BarrelBlock;
import net.minecraft.block.Block;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.EnderChestBlock;
import net.minecraft.block.ShulkerBoxBlock;
import net.minecraft.block.TrappedChestBlock;
import net.minecraft.client.MinecraftClient;
import net.minecraft.registry.Registries;
import net.minecraft.util.math.BlockPos;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.PriorityQueue;

/** Pemindai kontainer (chest/barrel/shulker) di chunk yang termuat, pola sama dengan OreTracker. */
public final class ChestFinder {
    private static final long SCAN_INTERVAL_MS = 1000L;
    private static final int MAX_NEAREST = 256;

    private static long lastScanMillis;
    private static Object lastWorld;
    private static BlockPos lastOrigin;
    private static List<OreTracker.Entry> entries = List.of();

    private ChestFinder() {
    }

    public static synchronized List<BlockPos> highlightPositions(MinecraftClient client, PlumConfig cfg) {
        update(client, cfg);
        List<BlockPos> out = new ArrayList<>();
        for (int i = 0; i < Math.min(6, entries.size()); i++) out.add(entries.get(i).pos());
        return out;
    }

    public static synchronized List<String> trackerLines(MinecraftClient client, PlumConfig cfg) {
        update(client, cfg);
        List<String> out = new ArrayList<>();
        if (!entries.isEmpty()) out.add("Chest terdekat:");
        for (int i = 0; i < Math.min(3, entries.size()); i++) {
            OreTracker.Entry e = entries.get(i);
            out.add("- " + e.label() + " " + String.format(Locale.ROOT, "%.0fm", e.distance())
                    + " (" + e.pos().getX() + ", " + e.pos().getY() + ", " + e.pos().getZ() + ")");
        }
        return out;
    }

    private static void update(MinecraftClient client, PlumConfig cfg) {
        long now = System.currentTimeMillis();
        if (client == null || client.world == null || client.player == null || cfg == null || !cfg.chestFinderEnabled) {
            entries = List.of();
            lastWorld = null;
            lastOrigin = null;
            return;
        }
        BlockPos origin = client.player.getBlockPos();
        boolean fresh = client.world == lastWorld && lastOrigin != null
                && origin.getSquaredDistance(lastOrigin) <= 4.0D && now - lastScanMillis < SCAN_INTERVAL_MS;
        if (fresh) return;
        lastScanMillis = now;
        lastWorld = client.world;
        lastOrigin = origin.toImmutable();
        int radius = Math.max(8, Math.min(64, cfg.chestRadius));
        PriorityQueue<OreTracker.Entry> nearest = new PriorityQueue<>(Comparator.comparingDouble(OreTracker.Entry::distance).reversed());
        double maxDistSq = (double) radius * radius;
        for (BlockPos pos : BlockPos.iterate(origin.add(-radius, -radius, -radius), origin.add(radius, radius, radius))) {
            if (!client.world.isChunkLoaded(pos)) continue;
            double distSq = pos.getSquaredDistance(origin);
            if (distSq > maxDistSq) continue;
            Block block = client.world.getBlockState(pos).getBlock();
            if (!isContainer(block, cfg.chestFinderTypes)) continue;
            String label = prettify(Registries.BLOCK.getId(block).toString());
            OreTracker.Entry entry = new OreTracker.Entry(pos.toImmutable(), label, Math.sqrt(distSq));
            if (nearest.size() < MAX_NEAREST) nearest.offer(entry);
            else if (!nearest.isEmpty() && entry.distance() < nearest.peek().distance()) { nearest.poll(); nearest.offer(entry); }
        }
        List<OreTracker.Entry> found = new ArrayList<>(nearest);
        found.sort(Comparator.comparingDouble(OreTracker.Entry::distance));
        entries = List.copyOf(found);
    }

    private static boolean isContainer(Block block, String types) {
        String mode = types == null ? "all" : types;
        return switch (mode) {
            case "chests" -> block instanceof ChestBlock || block instanceof TrappedChestBlock || block instanceof EnderChestBlock;
            case "barrels" -> block instanceof BarrelBlock;
            case "shulkers" -> block instanceof ShulkerBoxBlock;
            default -> block instanceof ChestBlock || block instanceof TrappedChestBlock
                    || block instanceof EnderChestBlock || block instanceof BarrelBlock || block instanceof ShulkerBoxBlock;
        };
    }

    private static String prettify(String id) {
        String path = id != null && id.contains(":") ? id.substring(id.indexOf(':') + 1) : String.valueOf(id);
        StringBuilder sb = new StringBuilder();
        for (String part : path.split("_")) {
            if (part.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) sb.append(part.substring(1));
        }
        return sb.length() == 0 ? path : sb.toString();
    }
}
