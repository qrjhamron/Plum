package id.plumcraft.client;

import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.mob.Monster;
import net.minecraft.entity.passive.PassiveEntity;
import net.minecraft.entity.player.PlayerEntity;

/** Filter kategori entity untuk ESP dan Tracers. */
public final class EntityTargets {
    private EntityTargets() {
    }

    public static boolean matches(Entity entity, String mode, Entity self) {
        if (!(entity instanceof LivingEntity living) || !living.isAlive() || entity == self) return false;
        if (mode == null) mode = "hostile";
        return switch (mode) {
            case "all" -> true;
            case "players" -> entity instanceof PlayerEntity;
            case "creatures" -> entity instanceof PassiveEntity;
            default -> entity instanceof Monster;
        };
    }

    public static int colorFor(Entity entity) {
        if (entity instanceof PlayerEntity) return 0xFF55FFFF;
        if (entity instanceof Monster) return 0xFFFF5555;
        return 0xFFFFFFFF;
    }
}
