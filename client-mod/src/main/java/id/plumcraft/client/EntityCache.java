package id.plumcraft.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;

import java.util.ArrayList;
import java.util.List;

/**
 * Optimasi in-game: snapshot entity hidup dipakai bersama KillAura/ESP/HUD render
 * dan di-refresh paling sering sesuai entityCacheMs, bukan diiterasi ulang
 * tiap modul dan tiap frame render dari world.getEntities().
 */
public final class EntityCache {
    private static long lastRefreshMillis;
    private static Object lastWorld;
    private static List<LivingEntity> cached = List.of();

    private EntityCache() {
    }

    public static synchronized List<LivingEntity> living(MinecraftClient client, PlumConfig cfg) {
        if (client == null || client.world == null) {
            cached = List.of();
            lastWorld = null;
            return cached;
        }
        long now = System.currentTimeMillis();
        int interval = cfg == null ? 50 : Math.max(25, Math.min(250, cfg.entityCacheMs));
        if (client.world == lastWorld && now - lastRefreshMillis < interval) {
            return cached;
        }
        lastRefreshMillis = now;
        lastWorld = client.world;
        List<LivingEntity> out = new ArrayList<>();
        for (Entity entity : client.world.getEntities()) {
            if (entity instanceof LivingEntity living && living.isAlive()) {
                out.add(living);
            }
        }
        cached = List.copyOf(out);
        return cached;
    }

    public static synchronized void invalidate() {
        lastRefreshMillis = 0L;
        lastWorld = null;
        cached = List.of();
    }
}
