package id.plumcraft.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EyeOfEnderEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Pencari stronghold lewat triangulasi dua lemparan Eye of Ender.
 * Hanya memakai posisi dan arah terbang Eye yang memang terlihat client;
 * tidak membaca seed, data server, atau struktur dunia.
 * Estimasi adalah perpotongan dua garis arah di bidang XZ.
 */
public final class StrongholdFinder {
    private record Throw(double x, double z, double dirX, double dirZ) {
    }

    private static final List<Throw> THROWS = new ArrayList<>();
    private static final Set<UUID> SEEN = new HashSet<>();
    private static Object lastWorld;

    private StrongholdFinder() {
    }

    public static synchronized void reset() {
        THROWS.clear();
        SEEN.clear();
    }

    /** Pindai Eye of Ender baru di sekitar pemain; kembalikan true bila lemparan baru tercatat. */
    public static synchronized boolean scan(MinecraftClient client, PlumConfig cfg) {
        if (client == null || client.world == null || client.player == null || cfg == null || !cfg.strongholdFinderEnabled) {
            return false;
        }
        if (client.world != lastWorld) {
            lastWorld = client.world;
            reset();
        }
        boolean added = false;
        for (Entity entity : client.world.getEntities()) {
            if (!(entity instanceof EyeOfEnderEntity eye)) continue;
            if (eye.getUuid() == null || SEEN.contains(eye.getUuid())) continue;
            if (eye.distanceTo(client.player) > 48.0D) continue;
            Vec3d vel = eye.getVelocity();
            double len = Math.hypot(vel.x, vel.z);
            // Eye baru dilempar belum tentu punya velocity client di tick pertama; tunggu sampai bergerak.
            if (len < 0.05D) continue;
            SEEN.add(eye.getUuid());
            // Abaikan lemparan dari titik yang hampir sama; triangulasi butuh dua titik berbeda.
            boolean duplicateOrigin = false;
            double minSeparation = Math.max(4, Math.min(32, cfg.strongholdMinSeparation));
            for (Throw t : THROWS) {
                if (Math.hypot(t.x() - eye.getX(), t.z() - eye.getZ()) < minSeparation) { duplicateOrigin = true; break; }
            }
            if (!duplicateOrigin) {
                THROWS.add(new Throw(eye.getX(), eye.getZ(), vel.x / len, vel.z / len));
                if (THROWS.size() > 4) THROWS.remove(0);
                added = true;
            }
        }
        // Batasi memori set UUID pada sesi panjang.
        if (SEEN.size() > 64) SEEN.clear();
        return added;
    }

    public static synchronized int throwCount() {
        return THROWS.size();
    }

    /** Estimasi posisi stronghold (XZ) dari lemparan pertama dan terakhir, atau null. */
    public static synchronized BlockPos estimate() {
        if (THROWS.size() < 2) return null;
        Throw a = THROWS.get(0);
        Throw b = THROWS.get(THROWS.size() - 1);
        double cross = a.dirX() * b.dirZ() - a.dirZ() * b.dirX();
        if (Math.abs(cross) < 1e-6D) return null;
        double dx = b.x() - a.x();
        double dz = b.z() - a.z();
        double t = (dx * b.dirZ() - dz * b.dirX()) / cross;
        if (t < 0.0D) return null;
        return new BlockPos((int) Math.floor(a.x() + a.dirX() * t), 0, (int) Math.floor(a.z() + a.dirZ() * t));
    }

    public static synchronized List<String> hudLines(MinecraftClient client, PlumConfig cfg) {
        List<String> out = new ArrayList<>();
        if (client == null || client.player == null || cfg == null || !cfg.strongholdFinderEnabled) return out;
        out.add("Stronghold: " + THROWS.size() + " lemparan tercatat");
        BlockPos est = estimate();
        if (est == null) {
            out.add(THROWS.isEmpty()
                    ? "- Lempar Eye of Ender untuk mulai"
                    : "- Lempar lagi dari tempat berjauhan (>" + Math.max(4, Math.min(32, cfg.strongholdMinSeparation)) + " blok)");
            return out;
        }
        double dx = est.getX() + 0.5D - client.player.getX();
        double dz = est.getZ() + 0.5D - client.player.getZ();
        double dist = Math.hypot(dx, dz);
        out.add(String.format(Locale.ROOT, "- Estimasi: %d, %d (%.0fm)", est.getX(), est.getZ(), dist));
        return out;
    }
}
