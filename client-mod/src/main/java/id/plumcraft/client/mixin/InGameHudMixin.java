package id.plumcraft.client.mixin;

import id.plumcraft.client.ChestFinder;
import id.plumcraft.client.ClickTracker;
import id.plumcraft.client.EntityCache;
import id.plumcraft.client.EntityTargets;
import id.plumcraft.client.OreTracker;
import id.plumcraft.client.PlumClientMod;
import id.plumcraft.client.PlumConfig;
import id.plumcraft.client.StrongholdFinder;
import id.plumcraft.client.TpsTracker;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.BowItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.item.TridentItem;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** HUD kiri-atas PlumClient: modul, FPS/TPS, CPS, ping, posisi, biome, kompas, armor, efek, sesi. */
@Mixin(InGameHud.class)
public abstract class InGameHudMixin {
    private static final int WHITE = 0xFFFFFF;
    private static final int ACCENT = 0xA78BFA;
    private static final int MUTED = 0xC9CED6;
    private static final String[] DIRECTIONS = {
            "Selatan", "Barat Daya", "Barat", "Barat Laut", "Utara", "Timur Laut", "Timur", "Tenggara"
    };

    @Inject(method = "render", at = @At("TAIL"))
    private void plumcraft$hud(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        PlumConfig cfg = PlumClientMod.config();
        if (client.player == null || client.world == null || client.options.hudHidden) return;
        drawTracers(context, client, cfg);
        drawEspHealth(context, client, cfg);
        drawTrajectories(context, client, cfg);
        drawNameTags(context, client, cfg);
        if (!cfg.hudEnabled) return;

        List<String> lines = new ArrayList<>();
        lines.add("PlumClient");
        if (cfg.hudActiveOnly) {
            List<String> active = new ArrayList<>();
            if (cfg.xrayEnabled) active.add("Xray");
            if (cfg.autoBrightEnabled) active.add("AutoBright");
            if (cfg.autoClickEnabled) active.add("AutoClick");
            if (cfg.autoWeaponEnabled) active.add("AutoWeapon");
            if (cfg.autoBowEnabled) active.add("AutoBow");
            if (cfg.noFallEnabled) active.add("NoFall");
            if (cfg.espEnabled) active.add("ESP");
            if (cfg.tracersEnabled) active.add("Tracers");
            if (cfg.scaffoldEnabled) active.add("Scaffold");
            if (cfg.autoToolEnabled) active.add("AutoTool");
            if (cfg.jesusEnabled) active.add("Jesus");
            if (cfg.chestStealerEnabled) active.add("Stealer");
            if (cfg.antiFogEnabled) active.add("AntiFog");
            if (cfg.chamsEnabled) active.add("Chams");
            if (cfg.triggerbotEnabled) active.add("Trigger");
            if (cfg.killAuraEnabled) active.add("KillAura");
            if (cfg.velocityEnabled) active.add("Velocity");
            if (cfg.sprintEnabled) active.add("Sprint");
            if (cfg.autoArmorEnabled) active.add("AutoArmor");
            if (cfg.freecamEnabled) active.add("Freecam");
            if (cfg.criticalsEnabled) active.add("Criticals");
            if (cfg.noSlowEnabled) active.add("NoSlow");
            if (cfg.autoTotemEnabled) active.add("AutoTotem");
            if (cfg.trajectoriesEnabled) active.add("Trajectories");
            if (cfg.nameTagsEnabled) active.add("NameTags");
            if (cfg.invManagerEnabled) active.add("InvManager");
            if (cfg.autoFishEnabled) active.add("AutoFish");
            if (cfg.autoMineEnabled) active.add("AutoMine");
            lines.add("Aktif: " + (active.isEmpty() ? "-" : String.join(", ", active)));
        } else {
        lines.add("Xray: " + onOff(cfg.xrayEnabled) + "  AutoBright: " + onOff(cfg.autoBrightEnabled));
        lines.add("AutoClick: " + (cfg.autoClickEnabled ? cfg.autoClickCps + " CPS (" + cfg.autoClickMode + "/" + cfg.autoClickTarget + ")" : "OFF"));
        lines.add("AutoWeapon: " + onOff(cfg.autoWeaponEnabled) + "  AutoBow: " + (cfg.autoBowEnabled ? "ON (" + cfg.autoBowRange + "m)" : "OFF"));
        lines.add("NoFall: " + onOff(cfg.noFallEnabled) + "  Crosshair: " + (cfg.crosshairEnabled ? cfg.crosshairStyle + "/" + cfg.crosshairColor : "OFF"));
        lines.add("ESP: " + (cfg.espEnabled ? "ON (" + cfg.espTargets + ")" : "OFF") + "  Tracers: " + (cfg.tracersEnabled ? "ON (" + cfg.tracerTargets + ")" : "OFF"));
        lines.add("Scaffold: " + onOff(cfg.scaffoldEnabled) + "  AutoTool: " + onOff(cfg.autoToolEnabled) + "  Discord: " + onOff(cfg.discordRpcEnabled));
        lines.add("Jesus: " + onOff(cfg.jesusEnabled) + "  Stealer: " + onOff(cfg.chestStealerEnabled) + "  AntiFog: " + onOff(cfg.antiFogEnabled) + "  Chams: " + onOff(cfg.chamsEnabled) + "  Trigger: " + onOff(cfg.triggerbotEnabled));
        lines.add("KillAura: " + (cfg.killAuraEnabled ? "ON (" + cfg.killAuraMode + "/" + cfg.killAuraPriority + ")" : "OFF")
                + "  Velocity: " + (cfg.velocityEnabled ? cfg.velocityMode + " H" + cfg.velocityHorizontal + "%/V" + cfg.velocityVertical + "%" : "OFF")
                + "  Sprint: " + (cfg.sprintEnabled ? cfg.sprintMode : "OFF"));
        lines.add("AutoArmor: " + onOff(cfg.autoArmorEnabled)
                + "  Freecam: " + (cfg.freecamEnabled ? "ON x" + cfg.freecamSpeed : "OFF"));
        lines.add("Criticals: " + (cfg.criticalsEnabled ? cfg.criticalsMode : "OFF")
                + "  NoSlow: " + onOff(cfg.noSlowEnabled) + "  AutoTotem: " + onOff(cfg.autoTotemEnabled));
        lines.add("Trajectories: " + onOff(cfg.trajectoriesEnabled) + "  NameTags: " + onOff(cfg.nameTagsEnabled)
                + "  InvMgr: " + onOff(cfg.invManagerEnabled) + "  Fish: " + onOff(cfg.autoFishEnabled) + "  Mine: " + onOff(cfg.autoMineEnabled));
        }
        if (cfg.killAuraEnabled) {
            String targetLine = PlumClientMod.killAuraTargetLine(client);
            if (targetLine != null) lines.add(targetLine);
        }
        if (cfg.strongholdFinderEnabled) {
            lines.addAll(StrongholdFinder.hudLines(client, cfg));
        }
        if (cfg.chestFinderEnabled) {
            lines.addAll(ChestFinder.trackerLines(client, cfg));
        }

        List<String> perf = new ArrayList<>();
        if (cfg.showFps) perf.add("FPS: " + client.getCurrentFps());
        if (cfg.showTps) perf.add("TPS: " + TpsTracker.format());
        if (!perf.isEmpty()) lines.add(String.join("  ", perf));

        if (cfg.showCps) lines.add("CPS: Kiri " + ClickTracker.leftCps() + "  Kanan " + ClickTracker.rightCps());
        if (cfg.showOreTracker && cfg.xrayEnabled) {
            List<String> ores = OreTracker.trackerLines(client, cfg);
            if (!ores.isEmpty()) {
                lines.add("Ore terdekat:");
                lines.addAll(ores);
            }
        }
        if (cfg.showPing) lines.add("Ping: " + pingText(client));
        if (cfg.showCoordinates) lines.add(String.format(Locale.ROOT, "XYZ: %.1f / %.1f / %.1f",
                client.player.getX(), client.player.getY(), client.player.getZ()));
        if (cfg.showBiome) lines.add("Biome: " + biomeText(client));
        if (cfg.showCompass) lines.add("Arah: " + compassText(client));
        if (cfg.showSession) lines.add("Sesi: " + durationText(PlumClientMod.sessionElapsedMillis()));

        if (cfg.showArmor) {
            List<String> armor = armorLines(client);
            if (!armor.isEmpty()) {
                lines.add("Armor:");
                lines.addAll(armor);
            }
        }
        if (cfg.showEffects) {
            List<String> effects = effectLines(client);
            if (!effects.isEmpty()) {
                lines.add("Efek:");
                lines.addAll(effects);
            }
        }

        int x = 6;
        int y = 6;
        for (int i = 0; i < lines.size(); i++) {
            String text = lines.get(i);
            int color = i == 0 ? ACCENT : (text.endsWith(":") ? MUTED : WHITE);
            int width = client.textRenderer.getWidth(text);
            context.fill(x - 3, y - 2, x + width + 3, y + 10, 0x66000000);
            context.drawText(client.textRenderer, text, x, y, color, true);
            y += 12;
        }
    }

    /** Tracers: proyeksikan posisi entity ke layar dan gambar garis putus dari crosshair. */
    private static void drawTracers(DrawContext context, MinecraftClient client, PlumConfig cfg) {
        if (!cfg.tracersEnabled || client.player == null || client.world == null) return;
        int width = context.getScaledWindowWidth();
        int height = context.getScaledWindowHeight();
        int originX = width / 2;
        int originY = height / 2;
        Vec3d cam = client.player.getEyePos();
        Vec3d forward = client.player.getRotationVec(1.0F).normalize();
        Vec3d right = forward.crossProduct(new Vec3d(0, 1, 0));
        if (right.lengthSquared() < 1e-6D) return;
        right = right.normalize();
        Vec3d up = right.crossProduct(forward).normalize();
        double fovRad = Math.toRadians(client.options.getFov().getValue().doubleValue());
        double tanHalf = Math.tan(fovRad / 2.0D);
        double aspect = height == 0 ? 1.0D : (double) width / (double) height;
        double range = Math.max(8, Math.min(128, cfg.tracerRange));
        for (LivingEntity entity : EntityCache.living(client, cfg)) {
            if (!EntityTargets.matches(entity, cfg.tracerTargets, client.player)) continue;
            if (entity.distanceTo(client.player) > range) continue;
            if (cfg.tracerVisibleOnly && entity instanceof LivingEntity livingEntity && !client.player.canSee(livingEntity)) continue;
            Vec3d target = entity.getPos().add(0, entity.getHeight() * 0.5D, 0);
            Vec3d d = target.subtract(cam);
            double cz = d.dotProduct(forward);
            if (cz <= 0.5D) continue;
            double cx = d.dotProduct(right);
            double cy = d.dotProduct(up);
            double ndcX = cx / (cz * tanHalf * aspect);
            double ndcY = cy / (cz * tanHalf);
            int sx = (int) Math.round((ndcX * 0.5D + 0.5D) * width);
            int sy = (int) Math.round((0.5D - ndcY * 0.5D) * height);
            if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
            int color = EntityTargets.colorFor(entity);
            int dx = sx - originX;
            int dy = sy - originY;
            int thick = Math.max(1, Math.min(4, cfg.tracerThickness));
            int steps = Math.max(1, (int) (Math.hypot(dx, dy) / 5.0D));
            for (int i = 0; i <= steps; i++) {
                int px = originX + dx * i / steps;
                int py = originY + dy * i / steps;
                context.fill(px, py, px + thick, py + thick, color);
            }
            context.fill(sx - thick, sy - thick, sx + thick + 1, sy + thick + 1, color);
        }
    }

    /** ESP health bar: proyeksikan entity dan gambar bar HP kecil di atas posisinya di layar. */
    private static void drawEspHealth(DrawContext context, MinecraftClient client, PlumConfig cfg) {
        if (!cfg.espEnabled || !cfg.espShowHealth || client.player == null || client.world == null) return;
        int width = context.getScaledWindowWidth();
        int height = context.getScaledWindowHeight();
        Vec3d cam = client.player.getEyePos();
        Vec3d forward = client.player.getRotationVec(1.0F).normalize();
        Vec3d right = forward.crossProduct(new Vec3d(0, 1, 0));
        if (right.lengthSquared() < 1e-6D) return;
        right = right.normalize();
        Vec3d up = right.crossProduct(forward).normalize();
        double fovRad = Math.toRadians(client.options.getFov().getValue().doubleValue());
        double tanHalf = Math.tan(fovRad / 2.0D);
        double aspect = height == 0 ? 1.0D : (double) width / (double) height;
        double range = Math.max(8, Math.min(128, cfg.espRange));
        for (LivingEntity living : EntityCache.living(client, cfg)) {
            Entity entity = living;
            if (!EntityTargets.matches(living, cfg.espTargets, client.player)) continue;
            if (living.distanceTo(client.player) > range) continue;
            Vec3d target = entity.getPos().add(0, entity.getHeight() + 0.35D, 0);
            Vec3d d = target.subtract(cam);
            double cz = d.dotProduct(forward);
            if (cz <= 0.5D) continue;
            double cx = d.dotProduct(right);
            double cy = d.dotProduct(up);
            double ndcX = cx / (cz * tanHalf * aspect);
            double ndcY = cy / (cz * tanHalf);
            int sx = (int) Math.round((ndcX * 0.5D + 0.5D) * width);
            int sy = (int) Math.round((0.5D - ndcY * 0.5D) * height);
            if (sx < -30 || sx > width + 30 || sy < -10 || sy > height + 10) continue;
            float frac = living.getMaxHealth() <= 0.0F ? 0.0F
                    : Math.max(0.0F, Math.min(1.0F, (living.getHealth() + living.getAbsorptionAmount()) / living.getMaxHealth()));
            int barW = 26;
            int filled = Math.round(barW * frac);
            int barColor = frac > 0.5F ? 0xFF55FF55 : frac > 0.25F ? 0xFFFFFF55 : 0xFFFF5555;
            context.fill(sx - barW / 2 - 1, sy - 1, sx + barW / 2 + 1, sy + 3, 0xAA000000);
            context.fill(sx - barW / 2, sy, sx - barW / 2 + filled, sy + 2, barColor);
        }
    }

    /** Proyeksi dunia -> layar bersama Trajectories/NameTags; null bila di belakang kamera. */
    private static int[] project(DrawContext context, MinecraftClient client, Vec3d target) {
        int width = context.getScaledWindowWidth();
        int height = context.getScaledWindowHeight();
        Vec3d cam = client.player.getEyePos();
        Vec3d forward = client.player.getRotationVec(1.0F).normalize();
        Vec3d right = forward.crossProduct(new Vec3d(0, 1, 0));
        if (right.lengthSquared() < 1e-6D) return null;
        right = right.normalize();
        Vec3d up = right.crossProduct(forward).normalize();
        double tanHalf = Math.tan(Math.toRadians(client.options.getFov().getValue().doubleValue()) / 2.0D);
        double aspect = height == 0 ? 1.0D : (double) width / (double) height;
        Vec3d d = target.subtract(cam);
        double cz = d.dotProduct(forward);
        if (cz <= 0.5D) return null;
        double cx = d.dotProduct(right);
        double cy = d.dotProduct(up);
        int sx = (int) Math.round((cx / (cz * tanHalf * aspect) * 0.5D + 0.5D) * width);
        int sy = (int) Math.round((0.5D - cy / (cz * tanHalf) * 0.5D) * height);
        return new int[]{sx, sy};
    }

    /** Trajectories: simulasi fisika proyektil vanilla (drag + gravitasi per item) dan gambar titik lintasan sampai kena blok. */
    private static void drawTrajectories(DrawContext context, MinecraftClient client, PlumConfig cfg) {
        if (!cfg.trajectoriesEnabled || client.player == null || client.world == null) return;
        ItemStack held = client.player.getMainHandStack();
        double speed;
        double gravity;
        if (held.getItem() instanceof BowItem) {
            float pull = client.player.isUsingItem() && client.player.getActiveItem() == held
                    ? BowItem.getPullProgress(client.player.getItemUseTime()) : 1.0F;
            if (pull <= 0.05F) return;
            speed = pull * 3.0D;
            gravity = 0.05D;
        } else if (held.getItem() instanceof TridentItem) {
            speed = 2.5D;
            gravity = 0.05D;
        } else if (held.isOf(Items.SNOWBALL) || held.isOf(Items.EGG) || held.isOf(Items.ENDER_PEARL)) {
            speed = 1.5D;
            gravity = 0.03D;
        } else {
            return;
        }
        Vec3d pos = client.player.getEyePos();
        Vec3d vel = client.player.getRotationVec(1.0F).multiply(speed);
        int steps = Math.max(20, Math.min(120, cfg.trajectoriesSteps));
        for (int i = 0; i < steps; i++) {
            vel = vel.multiply(0.99D);
            vel = new Vec3d(vel.x, vel.y - gravity, vel.z);
            pos = pos.add(vel);
            BlockPos blockPos = BlockPos.ofFloored(pos);
            boolean solid = !client.world.getBlockState(blockPos).getCollisionShape(client.world, blockPos).isEmpty();
            int[] screen = project(context, client, pos);
            if (screen != null) {
                if (solid) {
                    context.fill(screen[0] - 3, screen[1] - 1, screen[0] + 3, screen[1] + 1, 0xFFFF5555);
                    context.fill(screen[0] - 1, screen[1] - 3, screen[0] + 1, screen[1] + 3, 0xFFFF5555);
                } else if (i % 2 == 0) {
                    context.fill(screen[0] - 1, screen[1] - 1, screen[0] + 1, screen[1] + 1, 0xFF55FFFF);
                }
            }
            if (solid) break;
        }
    }

    /** NameTags: nama + HP + jarak di atas kepala entity tersaring, memakai cache entity bersama. */
    private static void drawNameTags(DrawContext context, MinecraftClient client, PlumConfig cfg) {
        if (!cfg.nameTagsEnabled || client.player == null || client.world == null) return;
        double range = Math.max(8, Math.min(128, cfg.nameTagsRange));
        for (LivingEntity living : EntityCache.living(client, cfg)) {
            if (!EntityTargets.matches(living, cfg.nameTagsTargets, client.player)) continue;
            double dist = living.distanceTo(client.player);
            if (dist > range) continue;
            int[] screen = project(context, client, living.getPos().add(0, living.getHeight() + 0.45D, 0));
            if (screen == null) continue;
            StringBuilder label = new StringBuilder(living.getName().getString());
            if (cfg.nameTagsShowHealth) {
                label.append(" ").append(Math.round(living.getHealth() + living.getAbsorptionAmount()))
                        .append("/").append(Math.round(living.getMaxHealth())).append(" HP");
            }
            if (cfg.nameTagsShowDistance) {
                label.append(String.format(Locale.ROOT, " %.0fm", dist));
            }
            String text = label.toString();
            int textWidth = client.textRenderer.getWidth(text);
            int x = screen[0] - textWidth / 2;
            int y = screen[1] - 8;
            context.fill(x - 3, y - 2, x + textWidth + 3, y + 10, 0x88000000);
            context.drawText(client.textRenderer, text, x, y, EntityTargets.colorFor(living), true);
        }
    }

    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void plumcraft$crosshair(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        PlumConfig cfg = PlumClientMod.config();
        if (!cfg.crosshairEnabled || client.player == null || client.world == null) return;
        if (client.options == null || !client.options.getPerspective().isFirstPerson()) return;
        if (client.options.hudHidden) return;
        ci.cancel();
        int cx = context.getScaledWindowWidth() / 2;
        int cy = context.getScaledWindowHeight() / 2;
        int size = Math.max(4, Math.min(20, cfg.crosshairSize));
        int color = crosshairColor(cfg.crosshairColor);
        if (cfg.crosshairHitMarker && client.crosshairTarget instanceof EntityHitResult hitResult
                && hitResult.getEntity() instanceof LivingEntity livingTarget && livingTarget.isAlive()) {
            color = 0xFFFF5555;
        }
        int gap = 3;
        if (cfg.crosshairDynamic && client.player != null) {
            gap += (int) Math.round((1.0F - client.player.getAttackCooldownProgress(0.0F)) * 4.0F);
        }
        String style = cfg.crosshairStyle == null ? "cross" : cfg.crosshairStyle;
        if ("dot".equals(style) || "crossdot".equals(style)) {
            context.fill(cx - 1, cy - 1, cx + 1, cy + 1, color);
        }
        if ("cross".equals(style) || "crossdot".equals(style)) {
            context.fill(cx - size, cy, cx - gap + 1, cy + 1, color);
            context.fill(cx + gap, cy, cx + size + 1, cy + 1, color);
            context.fill(cx, cy - size, cx + 1, cy - gap + 1, color);
            context.fill(cx, cy + gap, cx + 1, cy + size + 1, color);
        }
        if ("circle".equals(style)) {
            int r = size;
            for (int x = -r; x <= r; x++) {
                int y = (int) Math.round(Math.sqrt((double) r * r - (double) x * x));
                context.fill(cx + x, cy - y, cx + x + 1, cy - y + 1, color);
                context.fill(cx + x, cy + y, cx + x + 1, cy + y + 1, color);
                context.fill(cx - y, cy + x, cx - y + 1, cy + x + 1, color);
                context.fill(cx + y, cy + x, cx + y + 1, cy + x + 1, color);
            }
        }
    }

    private static int crosshairColor(String name) {
        int rgb = switch (name == null ? "white" : name) {
            case "green" -> 0x55FF55;
            case "red" -> 0xFF5555;
            case "cyan" -> 0x55FFFF;
            case "purple" -> 0xA78BFA;
            case "yellow" -> 0xFFE066;
            default -> 0xFFFFFF;
        };
        return 0xFF000000 | rgb;
    }

    private static String pingText(MinecraftClient client) {
        if (client.isInSingleplayer()) return "Lokal";
        try {
            if (client.getNetworkHandler() == null || client.player == null) return "-";
            PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
            return entry == null ? "-" : entry.getLatency() + " ms";
        } catch (Exception ignored) {
            return "-";
        }
    }

    private static String biomeText(MinecraftClient client) {
        try {
            String path = client.world.getBiome(client.player.getBlockPos()).getKey()
                    .map(key -> key.getValue().getPath())
                    .orElse("-");
            return prettify(path);
        } catch (Exception ignored) {
            return "-";
        }
    }

    private static String compassText(MinecraftClient client) {
        double yaw = ((client.player.getYaw() % 360.0D) + 360.0D) % 360.0D;
        int idx = (int) Math.floor(((yaw + 22.5D) % 360.0D) / 45.0D);
        return DIRECTIONS[idx] + " (" + Math.round(yaw) + "°)";
    }

    private static List<String> armorLines(MinecraftClient client) {
        List<String> out = new ArrayList<>();
        // Urutan tampil: helm -> sepatu (slot armor 3..0).
        for (int slot = 3; slot >= 0; slot--) {
            ItemStack stack = client.player.getInventory().getArmorStack(slot);
            if (stack.isEmpty()) continue;
            String name = stack.getName().getString();
            if (stack.isDamageable()) {
                int max = stack.getMaxDamage();
                int left = Math.max(0, max - stack.getDamage());
                int pct = max <= 0 ? 100 : Math.round(left * 100.0F / max);
                out.add("- " + name + ": " + left + "/" + max + " (" + pct + "%)");
            } else {
                out.add("- " + name);
            }
        }
        return out;
    }

    private static List<String> effectLines(MinecraftClient client) {
        List<String> out = new ArrayList<>();
        for (StatusEffectInstance effect : client.player.getStatusEffects()) {
            String name = effect.getEffectType().value().getName().getString();
            String level = effect.getAmplifier() > 0 ? " " + (effect.getAmplifier() + 1) : "";
            int duration = effect.getDuration();
            String time = duration < 0 ? "Inf" : durationClock(duration / 20);
            out.add("- " + name + level + " " + time);
            if (out.size() >= 8) break;
        }
        return out;
    }

    private static String durationClock(int totalSeconds) {
        int m = totalSeconds / 60;
        int s = totalSeconds % 60;
        return String.format(Locale.ROOT, "%d:%02d", m, s);
    }

    private static String durationText(long millis) {
        long totalSeconds = millis / 1000L;
        long h = totalSeconds / 3600L;
        long m = (totalSeconds % 3600L) / 60L;
        long s = totalSeconds % 60L;
        return String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s);
    }

    private static String prettify(String path) {
        if (path == null || path.isEmpty() || "-".equals(path)) return "-";
        String[] parts = path.split("_");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) sb.append(part.substring(1));
        }
        return sb.toString();
    }

    private static String onOff(boolean v) {
        return v ? "ON" : "OFF";
    }
}
