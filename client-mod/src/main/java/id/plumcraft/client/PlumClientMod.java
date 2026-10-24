package id.plumcraft.client;

import id.plumcraft.client.mixin.MinecraftClientAccessor;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.enchantment.EnchantmentHelper;
import net.minecraft.item.AxeItem;
import net.minecraft.item.BlockItem;
import net.minecraft.item.BowItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.item.HoeItem;
import net.minecraft.item.MaceItem;
import net.minecraft.item.PickaxeItem;
import net.minecraft.item.ShovelItem;
import net.minecraft.item.SwordItem;
import net.minecraft.item.TridentItem;
import net.minecraft.network.packet.c2s.play.PlayerMoveC2SPacket;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.ScreenHandlerType;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;
import net.minecraft.util.Hand;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.text.Text;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * PlumClient: Xray, AutoBright, AutoClick, HUD TPS, AutoWeapon, AutoBow,
 * NoFall, Stronghold Finder (triangulasi Eye of Ender), dan Crosshair kustom.
 * Untuk singleplayer, world sendiri, atau server yang secara eksplisit mengizinkan.
 * Hotkey: X = Xray, B = AutoBright, V = AutoClick, H = HUD,
 * Z = AutoWeapon, C = AutoBow, N = NoFall, G = Stronghold Finder, K = Crosshair,
 * O = ESP, P = Tracers, U = Chest Finder, Y = Scaffold, R = AutoTool,
 * I = KillAura, L = Velocity, ; = Sprint, ' = AutoArmor, F6 = Freecam.
 */
public final class PlumClientMod implements ClientModInitializer {
    private static PlumConfig config;
    private static final Map<Integer, Boolean> keyDown = new HashMap<>();
    private static Double originalGamma;
    private static boolean brightApplied;
    private static long lastClickMillis;
    private static long nextClickIntervalMillis = -1L;
    private static final Random HUMANIZER = new Random();
    private static long lastHighlightMillis;
    private static long lastNoFallMillis;
    private static long lastBowReleaseMillis;
    private static boolean bowDrawingByMod;
    private static long lastChestHighlightMillis;
    private static long lastScaffoldMillis;
    private static long lastConfigCheckMillis;
    private static long lastStealMillis;
    private static int stealSyncId = -1;
    private static boolean stoleSomething;
    private static final Set<UUID> espMarked = new HashSet<>();
    private static Object lastWorld;
    private static long sessionStartMillis;
    private static LivingEntity auraTarget;
    private static long lastAuraAttackMillis;
    private static long lastAuraSwitchMillis;
    private static int auraMultiCursor;
    private static Vec3d pendingVelocity;
    private static int pendingVelocityTicks;
    private static boolean pendingJumpReset;
    private static long lastArmorMillis;
    private static long lastUseClickMillis;
    private static long nextUseIntervalMillis = -1L;
    private static long lastWeaponSwitchMillis;
    private static long lastToolSwitchMillis;
    private static UUID triggerTargetId;
    private static long triggerTargetSinceMillis;
    private static long triggerDelayMillis;
    private static long lastCritMillis;
    private static long lastTotemMillis;
    private static long lastInvMillis;
    private static long lastFishMillis;
    private static long fishRecastAtMillis;
    private static boolean mineKeyForced;

    @Override
    public void onInitializeClient() {
        config = PlumConfig.load();
    }

    public static PlumConfig config() {
        if (config == null) config = PlumConfig.load();
        return config;
    }

    /** Lama sesi bermain sejak masuk world; 0 bila belum masuk world. */
    public static long sessionElapsedMillis() {
        return sessionStartMillis <= 0L ? 0L : Math.max(0L, System.currentTimeMillis() - sessionStartMillis);
    }

    /** Muat ulang config bila file diubah dari luar game (mis. toggle di launcher UI), tanpa perlu hotkey/restart. */
    private static void reloadConfigIfExternallyChanged(MinecraftClient client) {
        long now = System.currentTimeMillis();
        if (now - lastConfigCheckMillis < 1000L) return;
        lastConfigCheckMillis = now;
        long stamp = PlumConfig.currentFileStamp();
        if (stamp <= 0L || stamp == PlumConfig.lastFileStamp) return;
        boolean xrayWas = config != null && config.xrayEnabled;
        config = PlumConfig.load();
        if (client != null && client.worldRenderer != null && config.xrayEnabled != xrayWas) {
            client.worldRenderer.reload();
        }
        notify(client, "Pengaturan diperbarui dari launcher UI");
    }

    /** Dipanggil setiap client tick dari MinecraftClientMixin. */
    public static void onClientTick(MinecraftClient client) {
        if (client == null) return;
        reloadConfigIfExternallyChanged(client);
        PlumConfig cfg = config();
        if (client.world != lastWorld) {
            if (lastWorld == null && client.world != null) {
                sessionStartMillis = System.currentTimeMillis();
            }
            if (client.world == null) {
                sessionStartMillis = 0L;
            }
            lastWorld = client.world;
            espMarked.clear();
            EntityCache.invalidate();
            if (mineKeyForced && client.options != null) client.options.attackKey.setPressed(false);
            mineKeyForced = false;
            auraTarget = null;
            pendingVelocity = null;
            pendingVelocityTicks = 0;
            if (Freecam.active) Freecam.deactivate(client);
            TpsTracker.reset();
        }
        if (client.player == null || client.world == null) {
            if (Freecam.active) Freecam.deactivate(client);
            restoreBright(client);
            return;
        }

        handleKeys(client, cfg);
        applyBright(client, cfg);
        runFreecam(client, cfg);
        runSprint(client, cfg);
        runNoSlow(client, cfg);
        runVelocityPending(client, cfg);
        runEsp(client, cfg);
        runCriticals(client, cfg);
        runAutoWeapon(client, cfg);
        runAutoTool(client, cfg);
        runKillAura(client, cfg);
        runAutoArmor(client, cfg);
        runAutoTotem(client, cfg);
        runInvManager(client, cfg);
        runAutoClick(client, cfg);
        runAutoFish(client, cfg);
        runAutoMine(client, cfg);
        runAutoBow(client, cfg);
        runNoFall(client, cfg);
        runScaffold(client, cfg);
        runJesus(client, cfg);
        runTriggerbot(client, cfg);
        runChestStealer(client, cfg);
        runChestHighlight(client, cfg);
        DiscordRichPresence.tick(client, cfg);
        if (StrongholdFinder.scan(client, cfg)) {
            notify(client, "Stronghold: lemparan Eye tercatat (" + StrongholdFinder.throwCount() + ")"
                    + (StrongholdFinder.estimate() != null
                    ? ", estimasi " + StrongholdFinder.estimate().getX() + ", " + StrongholdFinder.estimate().getZ()
                    : ", lempar lagi dari tempat berjauhan"));
        }
        runOreHighlight(client, cfg);
    }

    private static boolean pressed(MinecraftClient client, int key) {
        long handle = client.getWindow().getHandle();
        boolean down = handle != 0L && GLFW.glfwGetKey(handle, key) == GLFW.GLFW_PRESS;
        boolean was = keyDown.getOrDefault(key, Boolean.FALSE);
        keyDown.put(key, down);
        return down && !was && client.currentScreen == null;
    }

    private static void handleKeys(MinecraftClient client, PlumConfig cfg) {
        if (pressed(client, GLFW.GLFW_KEY_X)) {
            cfg.xrayEnabled = !cfg.xrayEnabled;
            cfg.save();
            if (client.worldRenderer != null) client.worldRenderer.reload();
            notify(client, "Xray " + state(cfg.xrayEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_B)) {
            cfg.autoBrightEnabled = !cfg.autoBrightEnabled;
            cfg.save();
            if (!cfg.autoBrightEnabled) restoreBright(client);
            notify(client, "AutoBright " + state(cfg.autoBrightEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_V)) {
            cfg.autoClickEnabled = !cfg.autoClickEnabled;
            cfg.save();
            String rate = cfg.autoClickHumanizer
                    ? (cfg.autoClickCpsMin + "-" + cfg.autoClickCpsMax + " CPS acak")
                    : (cfg.autoClickCps + " CPS tetap");
            notify(client, "AutoClick " + state(cfg.autoClickEnabled) + " (" + rate + ", " + cfg.autoClickMode + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_H)) {
            cfg.hudEnabled = !cfg.hudEnabled;
            cfg.save();
            notify(client, "HUD PlumClient " + state(cfg.hudEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_Z)) {
            cfg.autoWeaponEnabled = !cfg.autoWeaponEnabled;
            cfg.save();
            notify(client, "AutoWeapon " + state(cfg.autoWeaponEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_C)) {
            cfg.autoBowEnabled = !cfg.autoBowEnabled;
            cfg.save();
            notify(client, "AutoBow " + state(cfg.autoBowEnabled) + " (jarak " + cfg.autoBowRange + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_N)) {
            cfg.noFallEnabled = !cfg.noFallEnabled;
            cfg.save();
            notify(client, "NoFall " + state(cfg.noFallEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_G)) {
            cfg.strongholdFinderEnabled = !cfg.strongholdFinderEnabled;
            cfg.save();
            if (!cfg.strongholdFinderEnabled) StrongholdFinder.reset();
            notify(client, "Stronghold Finder " + state(cfg.strongholdFinderEnabled) + ". Lempar Eye of Ender 2x dari tempat berjauhan.");
        }
        if (pressed(client, GLFW.GLFW_KEY_K)) {
            cfg.crosshairEnabled = !cfg.crosshairEnabled;
            cfg.save();
            notify(client, "Crosshair kustom " + state(cfg.crosshairEnabled) + " (" + cfg.crosshairStyle + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_O)) {
            cfg.espEnabled = !cfg.espEnabled;
            cfg.save();
            notify(client, "ESP " + state(cfg.espEnabled) + " (" + cfg.espTargets + ", " + cfg.espRange + "m)");
        }
        if (pressed(client, GLFW.GLFW_KEY_P)) {
            cfg.tracersEnabled = !cfg.tracersEnabled;
            cfg.save();
            notify(client, "Tracers " + state(cfg.tracersEnabled) + " (" + cfg.tracerTargets + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_U)) {
            cfg.chestFinderEnabled = !cfg.chestFinderEnabled;
            cfg.save();
            notify(client, "Chest Finder " + state(cfg.chestFinderEnabled) + " (radius " + cfg.chestRadius + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_Y)) {
            cfg.scaffoldEnabled = !cfg.scaffoldEnabled;
            cfg.save();
            notify(client, "Scaffold " + state(cfg.scaffoldEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_R)) {
            cfg.autoToolEnabled = !cfg.autoToolEnabled;
            cfg.save();
            notify(client, "AutoTool " + state(cfg.autoToolEnabled) + " (tool blok + mace/trident situasional)");
        }
        if (pressed(client, GLFW.GLFW_KEY_J)) {
            cfg.jesusEnabled = !cfg.jesusEnabled;
            cfg.save();
            notify(client, "Jesus " + state(cfg.jesusEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_COMMA)) {
            cfg.chestStealerEnabled = !cfg.chestStealerEnabled;
            cfg.save();
            notify(client, "Chest Stealer " + state(cfg.chestStealerEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_PERIOD)) {
            cfg.antiFogEnabled = !cfg.antiFogEnabled;
            cfg.save();
            notify(client, "AntiFog " + state(cfg.antiFogEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_M)) {
            cfg.chamsEnabled = !cfg.chamsEnabled;
            cfg.save();
            notify(client, "Chams " + state(cfg.chamsEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_SLASH)) {
            cfg.triggerbotEnabled = !cfg.triggerbotEnabled;
            cfg.save();
            notify(client, "Triggerbot " + state(cfg.triggerbotEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_I)) {
            cfg.killAuraEnabled = !cfg.killAuraEnabled;
            cfg.save();
            if (!cfg.killAuraEnabled) auraTarget = null;
            notify(client, "KillAura " + state(cfg.killAuraEnabled) + " (" + cfg.killAuraMode + "/" + cfg.killAuraPriority + ", " + cfg.killAuraRange + "m)");
        }
        if (pressed(client, GLFW.GLFW_KEY_L)) {
            cfg.velocityEnabled = !cfg.velocityEnabled;
            cfg.save();
            notify(client, "Velocity " + state(cfg.velocityEnabled) + " (" + cfg.velocityMode + " H" + cfg.velocityHorizontal + "% V" + cfg.velocityVertical + "%)");
        }
        if (pressed(client, GLFW.GLFW_KEY_SEMICOLON)) {
            cfg.sprintEnabled = !cfg.sprintEnabled;
            cfg.save();
            notify(client, "Sprint " + state(cfg.sprintEnabled) + " (" + cfg.sprintMode + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_APOSTROPHE)) {
            cfg.autoArmorEnabled = !cfg.autoArmorEnabled;
            cfg.save();
            notify(client, "AutoArmor " + state(cfg.autoArmorEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_F6)) {
            cfg.freecamEnabled = !cfg.freecamEnabled;
            cfg.save();
            notify(client, "Freecam " + state(cfg.freecamEnabled) + " (pemain " + (cfg.freecamFreeze ? "beku" : "bebas") + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_RIGHT_SHIFT)) {
            if (cfg.clickGuiEnabled) client.setScreen(new PlumClickGuiScreen());
        }
        if (pressed(client, GLFW.GLFW_KEY_F7)) {
            cfg.criticalsEnabled = !cfg.criticalsEnabled;
            cfg.save();
            notify(client, "Criticals " + state(cfg.criticalsEnabled) + " (" + cfg.criticalsMode + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_F8)) {
            cfg.noSlowEnabled = !cfg.noSlowEnabled;
            cfg.save();
            notify(client, "NoSlow " + state(cfg.noSlowEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_F9)) {
            cfg.autoTotemEnabled = !cfg.autoTotemEnabled;
            cfg.save();
            notify(client, "AutoTotem " + state(cfg.autoTotemEnabled) + " (HP <= " + cfg.autoTotemHealth + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_F10)) {
            cfg.trajectoriesEnabled = !cfg.trajectoriesEnabled;
            cfg.save();
            notify(client, "Trajectories " + state(cfg.trajectoriesEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_LEFT_BRACKET)) {
            cfg.nameTagsEnabled = !cfg.nameTagsEnabled;
            cfg.save();
            notify(client, "NameTags " + state(cfg.nameTagsEnabled) + " (" + cfg.nameTagsTargets + ")");
        }
        if (pressed(client, GLFW.GLFW_KEY_RIGHT_BRACKET)) {
            cfg.invManagerEnabled = !cfg.invManagerEnabled;
            cfg.save();
            notify(client, "InvManager " + state(cfg.invManagerEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_MINUS)) {
            cfg.autoFishEnabled = !cfg.autoFishEnabled;
            cfg.save();
            notify(client, "AutoFish " + state(cfg.autoFishEnabled));
        }
        if (pressed(client, GLFW.GLFW_KEY_EQUAL)) {
            cfg.autoMineEnabled = !cfg.autoMineEnabled;
            cfg.save();
            notify(client, "AutoMine " + state(cfg.autoMineEnabled));
        }
    }

    private static String state(boolean on) {
        return on ? "ON" : "OFF";
    }

    private static void notify(MinecraftClient client, String msg) {
        if (client.player != null) {
            client.player.sendMessage(Text.literal("[PlumClient] " + msg), true);
        }
    }

    private static void applyBright(MinecraftClient client, PlumConfig cfg) {
        if (client.options == null) return;
        if (originalGamma == null) {
            double current = client.options.getGamma().getValue();
            // Gamma > 1 hanya berasal dari fullbright; jangan jadikan itu nilai asal.
            originalGamma = current > 1.5D ? 1.0D : current;
        }
        if (cfg.autoBrightEnabled) {
            double targetGamma = Math.max(1.0D, Math.min(15.0D, cfg.autoBrightGamma));
            double currentGamma = client.options.getGamma().getValue();
            double nextGamma = cfg.autoBrightFade
                    ? currentGamma + Math.max(-0.75D, Math.min(0.75D, targetGamma - currentGamma))
                    : targetGamma;
            client.options.getGamma().setValue(nextGamma);
            brightApplied = true;
        } else {
            restoreBright(client);
        }
    }

    private static void restoreBright(MinecraftClient client) {
        if (brightApplied && client != null && client.options != null && originalGamma != null) {
            client.options.getGamma().setValue(originalGamma);
        }
        brightApplied = false;
    }

    private static void runAutoClick(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoClickEnabled || client.currentScreen != null || client.player == null || client.world == null) return;
        if (client.player.isDead() || client.player.isSpectator()) return;
        HitResult target = client.crosshairTarget;
        boolean attackHeld = client.options.attackKey.isPressed();
        boolean useHeld = client.options.useKey.isPressed();
        boolean attack = attackHeld && ("attack".equals(cfg.autoClickMode) || "both".equals(cfg.autoClickMode))
                && attackTargetAllows(cfg.autoClickTarget, target);
        boolean use = useHeld && ("use".equals(cfg.autoClickMode) || "both".equals(cfg.autoClickMode))
                && useTargetAllows(cfg.autoClickTarget, target);
        if (!attack && !use) return;
        if (cfg.autoClickToolGuard && !toolHasDurability(client, cfg.autoClickMinDurability)) return;

        // Humanizer: attack dan use punya timer + rentang CPS sendiri-sendiri
        // agar mode both tidak saling memblokir ritme klik kiri/kanan.
        long now = System.currentTimeMillis();
        MinecraftClientAccessor accessor = (MinecraftClientAccessor) client;
        if (attack) {
            long interval;
            if (cfg.autoClickHumanizer) {
                if (nextClickIntervalMillis <= 0L) nextClickIntervalMillis = rollHumanizerInterval(cfg.autoClickCpsMin, cfg.autoClickCpsMax);
                interval = nextClickIntervalMillis;
            } else {
                interval = Math.max(50L, 1000L / Math.max(1, Math.min(20, cfg.autoClickCps)));
            }
            if (now - lastClickMillis >= interval) {
                if (target instanceof EntityHitResult hit
                        && hit.getEntity() instanceof LivingEntity living && living.isAlive()
                        && cfg.autoClickSmoothAim) {
                    smoothAimAt(client, cfg, living);
                }
                if (attackReady(client, cfg, target)) {
                    accessor.plumcraft$doAttack();
                    lastClickMillis = now;
                    nextClickIntervalMillis = cfg.autoClickHumanizer ? rollHumanizerInterval(cfg.autoClickCpsMin, cfg.autoClickCpsMax) : -1L;
                }
            }
        }
        if (use) {
            long interval;
            if (cfg.autoClickHumanizer) {
                if (nextUseIntervalMillis <= 0L) nextUseIntervalMillis = rollHumanizerInterval(cfg.autoClickUseCpsMin, cfg.autoClickUseCpsMax);
                interval = nextUseIntervalMillis;
            } else {
                interval = Math.max(50L, 1000L / Math.max(1, Math.min(20, cfg.autoClickCps)));
            }
            if (now - lastUseClickMillis >= interval) {
                accessor.plumcraft$doItemUse();
                lastUseClickMillis = now;
                nextUseIntervalMillis = cfg.autoClickHumanizer ? rollHumanizerInterval(cfg.autoClickUseCpsMin, cfg.autoClickUseCpsMax) : -1L;
            }
        }
    }

    /** Undi interval klik berikutnya dari rentang CPS humanizer (hasil 50-1000 ms). */
    private static long rollHumanizerInterval(PlumConfig cfg) {
        return rollHumanizerInterval(cfg.autoClickCpsMin, cfg.autoClickCpsMax);
    }

    private static long rollHumanizerInterval(int cpsMin, int cpsMax) {
        int min = Math.max(1, Math.min(20, cpsMin));
        int max = Math.max(1, Math.min(20, cpsMax));
        if (max < min) max = min;
        double cps = min + HUMANIZER.nextDouble() * (max - min + 1.0D - 1e-9D);
        return Math.max(50L, Math.min(1000L, Math.round(1000.0D / Math.max(1.0D, cps))));
    }

    /** Interpolasi arah pandang ke target + jitter kecil; dipanggil tiap klik. */
    private static void smoothAimAt(MinecraftClient client, PlumConfig cfg, LivingEntity target) {
        if (client.player == null) return;
        double dx = target.getX() - client.player.getX();
        double dz = target.getZ() - client.player.getZ();
        double dy = (target.getY() + target.getHeight() * 0.5D) - client.player.getEyeY();
        double distXZ = Math.sqrt(dx * dx + dz * dz);
        if (distXZ < 1e-4D) return;
        float wantYaw = (float) (MathHelper.atan2(dz, dx) * 57.29577951308232D) - 90.0F;
        float wantPitch = (float) (-(MathHelper.atan2(dy, distXZ) * 57.29577951308232D));
        double jitter = Math.max(0.0D, Math.min(3.0D, cfg.autoClickJitter));
        if (jitter > 0.0D) {
            wantYaw += (float) (HUMANIZER.nextDouble() * 2.0D * jitter - jitter);
            wantPitch += (float) (HUMANIZER.nextDouble() * 2.0D * jitter - jitter);
        }
        float curYaw = client.player.getYaw();
        float curPitch = client.player.getPitch();
        float nextYaw = curYaw + MathHelper.wrapDegrees(wantYaw - curYaw) * 0.35F;
        float nextPitch = curPitch + MathHelper.wrapDegrees(wantPitch - curPitch) * 0.35F;
        client.player.setYaw(nextYaw);
        client.player.setPitch(MathHelper.clamp(nextPitch, -90.0F, 90.0F));
    }

    private static boolean attackTargetAllows(String wanted, HitResult target) {
        if ("entity".equals(wanted)) {
            return target instanceof EntityHitResult;
        }
        if ("block".equals(wanted)) {
            return target instanceof BlockHitResult;
        }
        // Mode gabungan attack/mining hanya bekerja saat crosshair benar-benar
        // mengarah ke entity atau blok; tidak ada ayunan kosong ke udara.
        return target instanceof EntityHitResult || target instanceof BlockHitResult;
    }

    private static boolean useTargetAllows(String wanted, HitResult target) {
        if ("entity".equals(wanted)) {
            return target instanceof EntityHitResult;
        }
        if ("block".equals(wanted)) {
            return target instanceof BlockHitResult;
        }
        // Use tetap boleh untuk item yang memang dipakai ke udara, misalnya makanan.
        return true;
    }

    private static boolean attackReady(MinecraftClient client, PlumConfig cfg, HitResult target) {
        if (target instanceof EntityHitResult) {
            // Serangan hanya dikirim saat cooldown senjata penuh supaya tidak ada ayunan sia-sia.
            return !cfg.autoClickCooldownSync
                    || client.player.getAttackCooldownProgress(0.0F) >= 1.0F;
        }
        if (target instanceof BlockHitResult blockHit) {
            // Mining vanilla sudah menahan proses break saat attack ditahan.
            // Jangan panggil doAttack ulang karena bisa mengganggu progres blok yang sama.
            if (client.interactionManager != null && client.interactionManager.isBreakingBlock()) {
                return false;
            }
            if (!client.player.isCreative()) {
                return client.world.getBlockState(blockHit.getBlockPos())
                        .getHardness(client.world, blockHit.getBlockPos()) >= 0.0F;
            }
        }
        return true;
    }

    private static boolean toolHasDurability(MinecraftClient client, int minLeft) {
        if (client.player == null) {
            return false;
        }
        ItemStack stack = client.player.getMainHandStack();
        if (stack.isEmpty() || !stack.isDamageable()) {
            return true;
        }
        int max = stack.getMaxDamage();
        int left = Math.max(0, max - stack.getDamage());
        return left > Math.max(1, Math.min(64, minLeft));
    }

    /** ESP: nyalakan outline glowing client-side untuk entity pilihan; matikan lagi yang pernah dinyalakan mod. */
    private static void runEsp(MinecraftClient client, PlumConfig cfg) {
        if (client.world == null || client.player == null) return;
        Set<UUID> shouldGlow = new HashSet<>();
        if (cfg.espEnabled || cfg.chamsEnabled) {
            double range = Math.max(8, Math.min(128, cfg.espRange));
            for (LivingEntity entity : EntityCache.living(client, cfg)) {
                if (!EntityTargets.matches(entity, cfg.espTargets, client.player)) continue;
                if (entity.distanceTo(client.player) > range) continue;
                shouldGlow.add(entity.getUuid());
                if (!entity.isGlowing()) {
                    entity.setGlowing(true);
                    espMarked.add(entity.getUuid());
                }
            }
        }
        // Lepas glow hanya pada entity yang dinyalakan mod dan tidak lagi jadi target,
        // dan jangan cabut glow asli dari efek/spectral arrow.
        for (Entity entity : client.world.getEntities()) {
            if (!espMarked.contains(entity.getUuid()) || shouldGlow.contains(entity.getUuid())) continue;
            if (entity instanceof LivingEntity living && living.hasStatusEffect(StatusEffects.GLOWING)) continue;
            entity.setGlowing(false);
            espMarked.remove(entity.getUuid());
        }
        if (!cfg.espEnabled && !cfg.chamsEnabled && espMarked.isEmpty()) return;
    }

    /** Jesus: tahan pemain di permukaan air/lava selama tidak sneak. */
    private static void runJesus(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.jesusEnabled || client.player == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isCreative()) return;
        if (client.player.getAbilities().flying || client.player.isGliding()) return;
        if (client.player.isSneaking() || client.options.sneakKey.isPressed()) return;
        boolean inWater = client.player.isTouchingWater() && cfg.jesusAffectWater;
        boolean inLava = client.player.isInLava() && cfg.jesusAffectLava;
        if (!inWater && !inLava) return;
        // Pemain yang baru masuk air tenggelam dulu; angkat hanya yang dekat permukaan agar tidak jadi fly.
        Vec3d vel = client.player.getVelocity();
        if (vel.y < 0.0D) {
            client.player.setVelocity(vel.x, Math.max(0.03D, Math.min(0.20D, cfg.jesusLift)), vel.z);
        }
        client.player.fallDistance = 0.0F;
        client.player.setOnGround(true);
    }

    /** Triggerbot: attack saat crosshair kena target tersaring setelah delay reaksi acak dalam rentang konfigurasi. */
    private static void runTriggerbot(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.triggerbotEnabled || client.currentScreen != null || client.player == null) {
            triggerTargetId = null;
            return;
        }
        if (client.player.isDead() || client.player.isSpectator() || client.player.isUsingItem()) return;
        if (!(client.crosshairTarget instanceof EntityHitResult hit)
                || !(hit.getEntity() instanceof LivingEntity target) || !target.isAlive()
                || !EntityTargets.matches(target, cfg.triggerbotTargets, client.player)) {
            triggerTargetId = null;
            return;
        }
        long now = System.currentTimeMillis();
        if (!target.getUuid().equals(triggerTargetId)) {
            triggerTargetId = target.getUuid();
            triggerTargetSinceMillis = now;
            int min = Math.max(0, Math.min(500, cfg.triggerbotDelayMinMs));
            int max = Math.max(min, Math.min(500, cfg.triggerbotDelayMaxMs));
            triggerDelayMillis = min + (max > min ? HUMANIZER.nextInt(max - min + 1) : 0);
        }
        if (now - triggerTargetSinceMillis < triggerDelayMillis) return;
        if (client.player.getAttackCooldownProgress(0.0F) < 1.0F) return;
        ((MinecraftClientAccessor) client).plumcraft$doAttack();
        triggerTargetId = null;
    }

    /** Item dianggap berharga untuk filter Chest Stealer: terenchant atau bahan/barang tier tinggi. */
    private static boolean isValuableItem(ItemStack stack) {
        if (stack == null || stack.isEmpty()) return false;
        if (stack.hasEnchantments()) return true;
        String path = net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).getPath();
        return path.contains("diamond") || path.contains("netherite") || path.contains("emerald")
                || path.equals("elytra") || path.equals("totem_of_undying")
                || path.equals("enchanted_golden_apple") || path.equals("golden_apple")
                || path.equals("ender_pearl") || path.equals("blaze_rod") || path.equals("ender_eye");
    }

    /** Chest Stealer: shift-klik isi kontainer yang dibuka ke inventory, lalu tutup bila sudah kosong. */
    private static void runChestStealer(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.chestStealerEnabled || client.player == null || client.interactionManager == null) return;
        if (client.currentScreen == null) { stealSyncId = -1; stoleSomething = false; return; }
        ScreenHandler handler = client.player.currentScreenHandler;
        if (handler == null || handler == client.player.playerScreenHandler) return;
        ScreenHandlerType<?> type;
        try { type = handler.getType(); } catch (Exception ignored) { return; }
        if (type != ScreenHandlerType.GENERIC_9X3 && type != ScreenHandlerType.GENERIC_9X6
                && type != ScreenHandlerType.SHULKER_BOX && type != ScreenHandlerType.HOPPER) return;
        if (handler.syncId != stealSyncId) { stealSyncId = handler.syncId; stoleSomething = false; }
        long now = System.currentTimeMillis();
        if (now - lastStealMillis < Math.max(25, Math.min(500, cfg.chestStealerDelayMs))) return;
        for (Slot slot : handler.slots) {
            if (slot.inventory == client.player.getInventory() || !slot.hasStack()) continue;
            if (cfg.chestStealerValuableOnly && !isValuableItem(slot.getStack())) continue;
            client.interactionManager.clickSlot(handler.syncId, slot.id, 0, SlotActionType.QUICK_MOVE, client.player);
            stoleSomething = true;
            lastStealMillis = now;
            return;
        }
        if (stoleSomething) {
            stoleSomething = false;
            stealSyncId = -1;
            client.player.closeHandledScreen();
        }
    }

    /** AutoTool untuk blok: pilih tool dengan kecepatan hancur tercepat untuk blok yang dibidik. */
    private static void runAutoTool(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoToolEnabled || client.currentScreen != null || client.player == null || client.world == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isUsingItem()) return;
        if (!(client.crosshairTarget instanceof BlockHitResult hit)) return;
        BlockState state = client.world.getBlockState(hit.getBlockPos());
        if (!client.player.isCreative() && state.getHardness(client.world, hit.getBlockPos()) < 0.0F) return;
        ItemStack current = client.player.getMainHandStack();
        double bestScore = toolScore(current, state, cfg);
        int bestSlot = -1;
        for (int slot = 0; slot < 9; slot++) {
            ItemStack stack = client.player.getInventory().getStack(slot);
            double score = toolScore(stack, state, cfg);
            if (score > bestScore + 0.01D) {
                bestScore = score;
                bestSlot = slot;
            }
        }
        // Hanya pindah bila ada tool yang sungguh cocok/lebih cepat, bukan sekadar tangan kosong lain.
        if (bestSlot >= 0 && bestScore > 1.01D) {
            if (System.currentTimeMillis() - lastToolSwitchMillis < Math.max(0, Math.min(500, cfg.autoToolSwitchDelayMs))) return;
            lastToolSwitchMillis = System.currentTimeMillis();
            client.player.getInventory().setSelectedSlot(bestSlot);
        }
    }

    private static double toolScore(ItemStack stack, BlockState state, PlumConfig cfg) {
        if (stack == null || stack.isEmpty()) return 1.0D;
        double score = stack.getMiningSpeedMultiplier(state);
        if (stack.isSuitableFor(state)) score += 100.0D;
        if (cfg != null && cfg.autoToolPreferSilk && hasEnchantment(stack, "silk_touch")) score += 50.0D;
        return score;
    }

    private static boolean hasEnchantment(ItemStack stack, String enchantPath) {
        try {
            for (var entry : EnchantmentHelper.getEnchantments(stack).getEnchantmentEntries()) {
                if (entry.getKey().getKey().map(k -> k.getValue().getPath()).orElse("").equals(enchantPath)) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    /** Scaffold/AutoBuild: pasang blok dari hotbar di bawah pemain saat berjalan di atas udara. */
    private static void runScaffold(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.scaffoldEnabled || client.currentScreen != null || client.player == null || client.world == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isCreative()) return;
        if (client.player.getAbilities().flying || client.player.isGliding()) return;
        Vec3d vel = client.player.getVelocity();
        boolean moving = Math.hypot(vel.x, vel.z) >= 0.05D;
        boolean towering = cfg.scaffoldTower && client.options.jumpKey.isPressed();
        if (!moving && !towering) return;
        BlockPos below = client.player.getBlockPos().down();
        BlockState belowState = client.world.getBlockState(below);
        if (!belowState.isAir() && !belowState.isReplaceable()) return;
        long now = System.currentTimeMillis();
        if (now - lastScaffoldMillis < Math.max(50, Math.min(500, cfg.scaffoldDelayMs))) return;
        // Cari blok yang bisa dipasang di hotbar; pilih otomatis bila tangan bukan blok.
        int blockSlot = -1;
        for (int slot = 0; slot < 9; slot++) {
            ItemStack stack = client.player.getInventory().getStack(slot);
            if (!stack.isEmpty() && stack.getItem() instanceof BlockItem) { blockSlot = slot; break; }
        }
        if (blockSlot < 0) return;
        // Cari tetangga padat untuk menempelkan blok di posisi bawah.
        BlockPos support = null;
        Direction face = null;
        for (Direction dir : Direction.values()) {
            if (dir == Direction.UP) continue;
            BlockPos neighbor = below.offset(dir);
            BlockState ns = client.world.getBlockState(neighbor);
            if (!ns.isAir() && !ns.isReplaceable()) { support = neighbor; face = dir.getOpposite(); break; }
        }
        if (support == null || client.interactionManager == null) return;
        client.player.getInventory().setSelectedSlot(blockSlot);
        BlockHitResult hit = new BlockHitResult(Vec3d.ofCenter(support), face, support, false);
        client.interactionManager.interactBlock(client.player, Hand.MAIN_HAND, hit);
        lastScaffoldMillis = now;
    }

    private static void runChestHighlight(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.chestFinderEnabled || client.world == null || client.player == null) return;
        long now = System.currentTimeMillis();
        if (now - lastChestHighlightMillis < 250L) return;
        lastChestHighlightMillis = now;
        for (BlockPos pos : ChestFinder.highlightPositions(client, cfg)) {
            client.world.addParticle(ParticleTypes.HAPPY_VILLAGER,
                    pos.getX() + 0.5D, pos.getY() + 0.75D, pos.getZ() + 0.5D,
                    0.0D, 0.03D, 0.0D);
        }
    }

    /** AutoWeapon: pilih senjata melee terkuat di hotbar saat crosshair mengenai entity hidup. Aktif juga lewat AutoTool untuk pilihan mace/trident situasional. */
    private static void runAutoWeapon(MinecraftClient client, PlumConfig cfg) {
        if ((!cfg.autoWeaponEnabled && !cfg.autoToolEnabled) || client.currentScreen != null || client.player == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isUsingItem()) return;
        if (!(client.crosshairTarget instanceof EntityHitResult hit)) return;
        if (!(hit.getEntity() instanceof LivingEntity target) || !target.isAlive()) return;
        if (client.player.distanceTo(target) > 5.0D) return;
        int bestSlot = -1;
        double bestScore = weaponScore(client, client.player.getMainHandStack());
        for (int slot = 0; slot < 9; slot++) {
            ItemStack stack = client.player.getInventory().getStack(slot);
            double score = weaponScore(client, stack);
            if (score > bestScore + 0.01D) {
                bestScore = score;
                bestSlot = slot;
            }
        }
        if (bestSlot >= 0) {
            if (System.currentTimeMillis() - lastWeaponSwitchMillis < Math.max(0, Math.min(1000, cfg.autoWeaponSwitchDelayMs))) return;
            lastWeaponSwitchMillis = System.currentTimeMillis();
            client.player.getInventory().setSelectedSlot(bestSlot);
        }
    }

    /** Skor senjata dari atribut attack damage/speed; mace diutamakan saat jatuh kencang (spear/trident di air). */
    private static double weaponScore(MinecraftClient client, ItemStack stack) {
        if (stack == null || stack.isEmpty()) return -1.0D;
        if (!(stack.getItem() instanceof SwordItem || stack.getItem() instanceof AxeItem
                || stack.getItem() instanceof TridentItem || stack.getItem() instanceof MaceItem)) {
            return -1.0D;
        }
        double[] sums = {0.0D, 0.0D};
        stack.applyAttributeModifiers(EquipmentSlot.MAINHAND, (attribute, modifier) -> {
            if (attribute == EntityAttributes.ATTACK_DAMAGE) sums[0] += modifier.value();
            if (attribute == EntityAttributes.ATTACK_SPEED) sums[1] += modifier.value();
        });
        if (sums[0] <= 0.0D) return -1.0D;
        // Damage jadi penentu utama, attack speed pemecah seri; enchantment ditimbang per jenis bila diaktifkan.
        double enchantBonus = 0.0D;
        if (stack.hasEnchantments()) {
            if (config().autoWeaponEnchantWeight) {
                try {
                    for (var entry : EnchantmentHelper.getEnchantments(stack).getEnchantmentEntries()) {
                        String path = entry.getKey().getKey().map(k -> k.getValue().getPath()).orElse("");
                        int lvl = entry.getIntValue();
                        enchantBonus += switch (path) {
                            case "sharpness" -> 0.6D * lvl;
                            case "smite", "bane_of_arthropods" -> 0.3D * lvl;
                            case "fire_aspect" -> 0.4D * lvl;
                            case "knockback", "looting" -> 0.1D * lvl;
                            default -> 0.1D * lvl;
                        };
                    }
                } catch (Exception ignored) {
                    enchantBonus = 0.25D;
                }
            } else {
                enchantBonus = 0.25D;
            }
        }
        double score = sums[0] * 10.0D + sums[1] + enchantBonus;
        // Pilihan situasional ala mace/spear: mace menang saat jatuh kencang (smash),
        // trident (spear) menang saat pemain di air atau kehujanan.
        if (client != null && client.player != null) {
            if (stack.getItem() instanceof MaceItem
                    && client.player.getVelocity().y < -0.5D && client.player.fallDistance >= 1.5F) {
                score += 1000.0D;
            }
            if (stack.getItem() instanceof TridentItem && client.player.isTouchingWaterOrRain()) {
                score += 500.0D;
            }
        }
        return score;
    }

    /** AutoBow: tarik busur otomatis saat membidik entity hidup, lepas saat charge cukup. */
    private static void runAutoBow(MinecraftClient client, PlumConfig cfg) {
        if (client.player == null || client.player.isDead() || client.player.isSpectator()) {
            bowDrawingByMod = false;
            return;
        }
        if (!cfg.autoBowEnabled || client.currentScreen != null) {
            bowDrawingByMod = false;
            return;
        }
        if (client.player.isUsingItem()) {
            if (!bowDrawingByMod) return;
            if (!(client.player.getActiveItem().getItem() instanceof BowItem)) {
                bowDrawingByMod = false;
                return;
            }
            if (cfg.autoBowPredictive) {
                LivingEntity predicted = bowTarget(client, cfg);
                if (predicted != null) {
                    float[] want = desiredRotation(client, predicted);
                    float yawStep = MathHelper.clamp(MathHelper.wrapDegrees(want[0] - client.player.getYaw()), -25.0F, 25.0F);
                    float pitchStep = MathHelper.clamp(MathHelper.wrapDegrees(want[1] - client.player.getPitch()), -25.0F, 25.0F);
                    client.player.setYaw(client.player.getYaw() + yawStep);
                    client.player.setPitch(MathHelper.clamp(client.player.getPitch() + pitchStep, -90.0F, 90.0F));
                }
            }
            int useTime = client.player.getItemUseTime();
            float pull = BowItem.getPullProgress(useTime);
            boolean ready = cfg.autoBowFullCharge ? pull >= 1.0F : pull >= 0.75F;
            boolean targetValid = bowTarget(client, cfg) != null;
            if ((ready && targetValid) || useTime >= 100) {
                if (client.interactionManager != null) client.interactionManager.stopUsingItem(client.player);
                bowDrawingByMod = false;
                lastBowReleaseMillis = System.currentTimeMillis();
            }
            return;
        }
        bowDrawingByMod = false;
        if (System.currentTimeMillis() - lastBowReleaseMillis < 400L) return;
        if (!(client.player.getMainHandStack().getItem() instanceof BowItem)) return;
        if (bowTarget(client, cfg) == null) return;
        ItemStack bow = client.player.getMainHandStack();
        if (!client.player.isCreative() && client.player.getProjectileType(bow).isEmpty()) return;
        ((MinecraftClientAccessor) client).plumcraft$doItemUse();
        bowDrawingByMod = client.player.isUsingItem();
    }

    private static LivingEntity bowTarget(MinecraftClient client, PlumConfig cfg) {
        if (!(client.crosshairTarget instanceof EntityHitResult hit)) return null;
        if (!(hit.getEntity() instanceof LivingEntity target) || !target.isAlive()) return null;
        return client.player.distanceTo(target) <= Math.max(8, Math.min(64, cfg.autoBowRange)) ? target : null;
    }

    /** NoFall: kirim paket onGround saat jatuh agar fall damage tidak terakumulasi. Khusus singleplayer/server yang mengizinkan. */
    private static void runNoFall(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.noFallEnabled || client.player == null || client.getNetworkHandler() == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isCreative()) return;
        if (client.player.getAbilities().flying || client.player.isGliding()) return;
        if (client.player.isTouchingWater() || client.player.isInLava()) return;
        if (client.player.getVelocity().y >= -0.1D || client.player.fallDistance < Math.max(2, Math.min(12, cfg.noFallMinDistance))) return;
        long now = System.currentTimeMillis();
        if (now - lastNoFallMillis < Math.max(50, Math.min(500, cfg.noFallIntervalMs))) return;
        lastNoFallMillis = now;
        client.getNetworkHandler().sendPacket(new PlayerMoveC2SPacket.OnGroundOnly(true, client.player.horizontalCollision));
        client.player.fallDistance = 0.0F;
    }

    private static void runOreHighlight(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.xrayEnabled || !cfg.xrayHighlight || client.world == null || client.player == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastHighlightMillis < 250L) {
            return;
        }
        lastHighlightMillis = now;
        for (BlockPos pos : OreTracker.highlightPositions(client, cfg)) {
            client.world.addParticle(ParticleTypes.END_ROD,
                    pos.getX() + 0.5D, pos.getY() + 0.75D, pos.getZ() + 0.5D,
                    0.0D, 0.025D, 0.0D);
        }
    }

    // ================= KillAura Advanced =================

    /**
     * KillAura: pilih target dalam scan range (prioritas jarak/health/sudut/hurtTime),
     * putar pandangan prediktif dengan batas derajat per tick, lalu serang langsung
     * ke entity (bukan crosshair) saat cooldown + CPS + sudut + garis pandang lolos.
     * Mode single menempel ke satu target, switch berganti berkala, multi bergiliran tiap serangan.
     */
    private static void runKillAura(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.killAuraEnabled || client.currentScreen != null || client.player == null || client.world == null
                || client.interactionManager == null) {
            auraTarget = null;
            return;
        }
        if (client.player.isDead() || client.player.isSpectator() || client.player.isUsingItem()) return;
        double scan = Math.max(cfg.killAuraRange, cfg.killAuraScanRange);
        List<LivingEntity> candidates = new ArrayList<>();
        for (LivingEntity living : EntityCache.living(client, cfg)) {
            if (!EntityTargets.matches(living, cfg.killAuraTargets, client.player)) continue;
            if (cfg.killAuraIgnoreInvisible && living.isInvisible()) continue;
            if (client.player.isTeammate(living)) continue;
            if (client.player.distanceTo(living) > scan) continue;
            if (angleToTarget(client, living) > cfg.killAuraFov / 2.0D && cfg.killAuraFov < 360) continue;
            candidates.add(living);
        }
        if (candidates.isEmpty()) {
            auraTarget = null;
            return;
        }
        Comparator<LivingEntity> byPriority = switch (cfg.killAuraPriority) {
            case "health" -> Comparator.comparingDouble((LivingEntity e) -> e.getHealth() + e.getAbsorptionAmount())
                    .thenComparingDouble(e -> client.player.distanceTo(e));
            case "angle" -> Comparator.comparingDouble((LivingEntity e) -> angleToTarget(client, e));
            case "hurttime" -> Comparator.comparingInt((LivingEntity e) -> e.hurtTime)
                    .thenComparingDouble(e -> client.player.distanceTo(e));
            default -> Comparator.comparingDouble((LivingEntity e) -> client.player.distanceTo(e));
        };
        candidates.sort(byPriority);
        long now = System.currentTimeMillis();
        LivingEntity chosen = pickAuraTarget(client, candidates, now, cfg);
        auraTarget = chosen;
        if (chosen == null) return;

        rotateToward(client, cfg, chosen);
        if (client.player.distanceTo(chosen) > cfg.killAuraRange) return;
        if (!cfg.killAuraThroughWalls && !client.player.canSee(chosen)) return;
        if (aimErrorDegrees(client, chosen) > 14.0D) return;
        if (cfg.killAuraRequireCooldown && client.player.getAttackCooldownProgress(0.0F) < 1.0F) return;
        long minInterval = Math.max(50L, 1000L / Math.max(1, Math.min(20, cfg.killAuraCps)));
        if (now - lastAuraAttackMillis < minInterval) return;
        if (cfg.killAuraSmartCrit && !client.player.isOnGround()
                && client.player.getVelocity().y >= 0.0D
                && !client.player.isTouchingWater() && !client.player.isInLava()
                && !client.player.isClimbing() && !client.player.isGliding()
                && !client.player.getAbilities().flying) {
            return;
        }
        client.interactionManager.attackEntity(client.player, chosen);
        client.player.swingHand(Hand.MAIN_HAND);
        ClickTracker.recordLeft();
        lastAuraAttackMillis = now;
        auraMultiCursor++;
        if (cfg.sprintEnabled && cfg.sprintKeepSprint) client.player.setSprinting(true);
    }

    private static LivingEntity pickAuraTarget(MinecraftClient client, List<LivingEntity> sorted, long now, PlumConfig cfg) {
        boolean stickyValid = auraTarget != null && auraTarget.isAlive() && sorted.contains(auraTarget);
        if ("single".equals(cfg.killAuraMode)) {
            return stickyValid ? auraTarget : sorted.get(0);
        }
        if ("switch".equals(cfg.killAuraMode)) {
            if (stickyValid && now - lastAuraSwitchMillis < Math.max(0, cfg.killAuraSwitchDelayMs)) return auraTarget;
            int next = stickyValid ? (sorted.indexOf(auraTarget) + 1) % sorted.size() : 0;
            lastAuraSwitchMillis = now;
            return sorted.get(next);
        }
        return sorted.get(Math.floorMod(auraMultiCursor, sorted.size()));
    }

    /** Sudut (derajat) antara arah pandang pemain dan arah ke tengah target. */
    private static double angleToTarget(MinecraftClient client, LivingEntity target) {
        Vec3d look = client.player.getRotationVec(1.0F);
        Vec3d to = target.getPos().add(0.0D, target.getHeight() * 0.5D, 0.0D).subtract(client.player.getEyePos());
        if (to.lengthSquared() < 1e-8D) return 0.0D;
        double dot = Math.max(-1.0D, Math.min(1.0D, look.normalize().dotProduct(to.normalize())));
        return Math.toDegrees(Math.acos(dot));
    }

    /** Yaw/pitch ideal ke titik bidik prediktif (posisi target + velocity 1 tick, tinggi 72%). */
    private static float[] desiredRotation(MinecraftClient client, LivingEntity target) {
        Vec3d aim = target.getPos().add(0.0D, target.getHeight() * 0.72D, 0.0D).add(target.getVelocity());
        double dx = aim.x - client.player.getEyePos().x;
        double dy = aim.y - client.player.getEyePos().y;
        double dz = aim.z - client.player.getEyePos().z;
        double distXZ = Math.sqrt(dx * dx + dz * dz);
        float yaw = (float) (MathHelper.atan2(dz, dx) * 57.29577951308232D) - 90.0F;
        float pitch = (float) (-(MathHelper.atan2(dy, Math.max(1e-4D, distXZ)) * 57.29577951308232D));
        return new float[]{yaw, pitch};
    }

    /** Putar pandangan ke target dengan langkah maksimum killAuraRotationSpeed derajat per tick. */
    private static void rotateToward(MinecraftClient client, PlumConfig cfg, LivingEntity target) {
        float[] want = desiredRotation(client, target);
        float maxStep = Math.max(10, Math.min(180, cfg.killAuraRotationSpeed));
        float yawDiff = MathHelper.wrapDegrees(want[0] - client.player.getYaw());
        float pitchDiff = MathHelper.wrapDegrees(want[1] - client.player.getPitch());
        float yawStep = MathHelper.clamp(yawDiff, -maxStep, maxStep);
        float pitchStep = MathHelper.clamp(pitchDiff, -maxStep, maxStep);
        client.player.setYaw(client.player.getYaw() + yawStep);
        client.player.setPitch(MathHelper.clamp(client.player.getPitch() + pitchStep, -90.0F, 90.0F));
    }

    private static double aimErrorDegrees(MinecraftClient client, LivingEntity target) {
        float[] want = desiredRotation(client, target);
        double yawDiff = MathHelper.wrapDegrees(want[0] - client.player.getYaw());
        double pitchDiff = MathHelper.wrapDegrees(want[1] - client.player.getPitch());
        return Math.sqrt(yawDiff * yawDiff + pitchDiff * pitchDiff);
    }

    /** Baris target KillAura untuk HUD; null bila tidak ada target aktif. */
    public static String killAuraTargetLine(MinecraftClient client) {
        if (auraTarget == null || !auraTarget.isAlive() || client == null || client.player == null) return null;
        return "Target: " + auraTarget.getName().getString()
                + " HP " + Math.round(auraTarget.getHealth() + auraTarget.getAbsorptionAmount())
                + "/" + Math.round(auraTarget.getMaxHealth())
                + " " + String.format(java.util.Locale.ROOT, "%.1fm", client.player.distanceTo(auraTarget));
    }

    // ================= Velocity Advanced =================

    /**
     * Dipanggil dari mixin paket velocity tepat setelah velocity vanilla diterapkan ke pemain:
     * skala per sumbu (mode cancel = nol), tunda beberapa tick bila diatur, dan jadwalkan
     * jump-reset acak. Velocity entity lain diabaikan lewat cek ID entity paket.
     */
    public static void handleVelocityApplied(int entityId) {
        MinecraftClient client = MinecraftClient.getInstance();
        PlumConfig cfg = config();
        if (!cfg.velocityEnabled || client == null || client.player == null) return;
        if (entityId != client.player.getId()) return;
        if (cfg.velocityRequireMoving
                && !client.options.forwardKey.isPressed() && !client.options.backKey.isPressed()
                && !client.options.leftKey.isPressed() && !client.options.rightKey.isPressed()) return;
        double h = "cancel".equals(cfg.velocityMode) ? 0.0D : Math.max(0, Math.min(100, cfg.velocityHorizontal)) / 100.0D;
        double v = "cancel".equals(cfg.velocityMode) ? 0.0D : Math.max(0, Math.min(100, cfg.velocityVertical)) / 100.0D;
        Vec3d vel = client.player.getVelocity();
        double horizontalSpeed = Math.hypot(vel.x, vel.z);
        Vec3d scaled = new Vec3d(vel.x * h, vel.y * v, vel.z * h);
        if (cfg.velocityDelayTicks > 0) {
            pendingVelocity = scaled;
            pendingVelocityTicks = Math.max(1, Math.min(10, cfg.velocityDelayTicks));
            client.player.setVelocity(Vec3d.ZERO);
        } else {
            client.player.setVelocity(scaled);
        }
        if (cfg.velocityJumpReset && client.player.isOnGround() && horizontalSpeed > 0.1D
                && HUMANIZER.nextInt(100) < Math.max(1, Math.min(100, cfg.velocityJumpResetChance))) {
            pendingJumpReset = true;
        }
    }

    private static void runVelocityPending(MinecraftClient client, PlumConfig cfg) {
        if (pendingVelocityTicks > 0 && --pendingVelocityTicks == 0 && pendingVelocity != null) {
            client.player.setVelocity(pendingVelocity);
            pendingVelocity = null;
        }
        if (pendingJumpReset) {
            pendingJumpReset = false;
            if (client.player.isOnGround()) {
                Vec3d vel = client.player.getVelocity();
                client.player.setVelocity(vel.x, 0.42D, vel.z);
            }
        }
    }

    // ================= Sprint Advanced =================

    /**
     * Sprint otomatis: mode legit hanya maju, mode omni semua arah. Dihormati:
     * lapar (food <= 6), blindness, sneak, tabrakan (legit), dan pemakaian item
     * kecuali sprintWhileUsing. KeepSprint menegaskan ulang sprint tiap tick.
     */
    private static void runSprint(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.sprintEnabled || client.player == null || client.currentScreen != null) return;
        if (client.player.isDead() || client.player.isSpectator()) return;
        if (client.player.hasStatusEffect(StatusEffects.BLINDNESS)) return;
        if (!client.player.isCreative() && client.player.getHungerManager().getFoodLevel() <= 6) return;
        if (client.player.isSneaking()) return;
        if (client.player.isUsingItem() && !cfg.sprintWhileUsing) return;
        boolean forward = client.options.forwardKey.isPressed();
        boolean anyMove = forward || client.options.backKey.isPressed()
                || client.options.leftKey.isPressed() || client.options.rightKey.isPressed();
        boolean allowed = "omni".equals(cfg.sprintMode) ? anyMove
                : forward && !client.options.backKey.isPressed() && !client.player.horizontalCollision;
        if (allowed) client.player.setSprinting(true);
    }

    // ================= AutoArmor Advanced =================

    /**
     * AutoArmor: nilai armor dari protection + toughness + bobot enchantment per jenis,
     * ganti potongan yang lebih lemah (maks satu pergantian per jeda). Elytra dihormati
     * sesuai preferensi; potongan lama disimpan ke slot asal atau dibuang bila dropOld.
     */
    private static void runAutoArmor(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoArmorEnabled || client.player == null || client.interactionManager == null) return;
        if (client.player.isDead() || client.player.isSpectator()) return;
        ScreenHandler handler = client.player.currentScreenHandler;
        if (handler == null || handler != client.player.playerScreenHandler) return;
        long now = System.currentTimeMillis();
        if (now - lastArmorMillis < Math.max(50, Math.min(1000, cfg.autoArmorDelayMs))) return;
        for (EquipmentSlot type : List.of(EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET)) {
            int armorSlotId = armorSlotId(type);
            if (armorSlotId < 0 || armorSlotId >= handler.slots.size()) continue;
            if (handler.slots.get(armorSlotId).inventory != client.player.getInventory()) continue;
            ItemStack equipped = client.player.getEquippedStack(type);
            if (type == EquipmentSlot.CHEST && cfg.autoArmorPreferElytra
                    && isUsableElytra(equipped)) continue;
            double equippedScore = armorScore(equipped, type, cfg);
            int bestSlotId = -1;
            double bestScore = equippedScore;
            for (Slot slot : handler.slots) {
                if (slot.inventory != client.player.getInventory() || slot.id < 9) continue;
                if (cfg.autoArmorHotbarOnly && (slot.id < 36 || slot.id > 44)) continue;
                double score = armorScore(slot.getStack(), type, cfg);
                if (score > bestScore + 0.01D) {
                    bestScore = score;
                    bestSlotId = slot.id;
                }
            }
            if (bestSlotId < 0) continue;
            equipArmorSlot(client, handler, bestSlotId, armorSlotId, equipped.isEmpty(), cfg);
            lastArmorMillis = now;
            return;
        }
    }

    /** Slot handler layar pemain vanilla: 5 helm, 6 dada, 7 kaki, 8 sepatu. */
    private static int armorSlotId(EquipmentSlot type) {
        return switch (type) {
            case HEAD -> 5;
            case CHEST -> 6;
            case LEGS -> 7;
            case FEET -> 8;
            default -> -1;
        };
    }

    private static void equipArmorSlot(MinecraftClient client, ScreenHandler handler, int fromSlotId,
                                       int armorSlotId, boolean armorEmpty, PlumConfig cfg) {
        var manager = client.interactionManager;
        int syncId = handler.syncId;
        manager.clickSlot(syncId, fromSlotId, 0, SlotActionType.PICKUP, client.player);
        manager.clickSlot(syncId, armorSlotId, 0, SlotActionType.PICKUP, client.player);
        if (armorEmpty) return;
        if (cfg.autoArmorDropOld) {
            manager.clickSlot(syncId, -999, 0, SlotActionType.PICKUP, client.player);
        } else {
            manager.clickSlot(syncId, fromSlotId, 0, SlotActionType.PICKUP, client.player);
        }
    }

    /** Elytra 1.21.4 adalah item berkomponen glider; masih bisa dipakai bila durability tersisa > 1. */
    private static boolean isUsableElytra(ItemStack stack) {
        return stack != null && stack.isOf(Items.ELYTRA)
                && (!stack.isDamageable() || stack.getDamage() < stack.getMaxDamage() - 1);
    }

    /** Skor armor: defense + toughness + enchantment berbobot; elytra khusus slot dada. */
    private static double armorScore(ItemStack stack, EquipmentSlot type, PlumConfig cfg) {
        if (stack == null || stack.isEmpty()) return -1.0D;
        if (stack.isOf(Items.ELYTRA)) {
            if (type != EquipmentSlot.CHEST || !isUsableElytra(stack)) return -1.0D;
            return cfg.autoArmorPreferElytra ? 1000.0D : 40.0D;
        }
        var equippable = stack.get(DataComponentTypes.EQUIPPABLE);
        if (equippable == null || equippable.slot() != type) return -1.0D;
        double[] sums = {0.0D, 0.0D};
        stack.applyAttributeModifiers(type, (attribute, modifier) -> {
            if (attribute == EntityAttributes.ARMOR) sums[0] += modifier.value();
            if (attribute == EntityAttributes.ARMOR_TOUGHNESS) sums[1] += modifier.value();
        });
        if (sums[0] <= 0.0D) return -1.0D;
        double score = sums[0] * 10.0D + sums[1] * 2.0D;
        try {
            for (var entry : EnchantmentHelper.getEnchantments(stack).getEnchantmentEntries()) {
                String path = entry.getKey().getKey().map(k -> k.getValue().getPath()).orElse("");
                int lvl = entry.getIntValue();
                score += switch (path) {
                    case "protection" -> 3.0D * lvl;
                    case "fire_protection", "blast_protection", "projectile_protection" -> 1.5D * lvl;
                    case "feather_falling" -> type == EquipmentSlot.FEET ? 2.0D * lvl : 0.0D;
                    case "respiration", "aqua_affinity" -> type == EquipmentSlot.HEAD ? 1.5D * lvl : 0.0D;
                    case "depth_strider", "frost_walker", "soul_speed", "swift_sneak" -> 1.0D * lvl;
                    case "thorns" -> 0.5D * lvl;
                    case "unbreaking" -> 0.3D * lvl;
                    case "mending" -> 1.0D;
                    case "vanishing_curse", "binding_curse" -> -2.0D;
                    default -> 0.2D * lvl;
                };
            }
        } catch (Exception ignored) {
            // Item tanpa data enchantment tetap dinilai dari defense dasarnya.
        }
        if (stack.isDamageable() && stack.getMaxDamage() > 0) {
            double remain = 1.0D - (double) stack.getDamage() / (double) stack.getMaxDamage();
            score -= (1.0D - remain) * 2.0D;
            if (remain < 0.10D) score -= 5.0D;
        }
        return score;
    }

    // ================= Freecam Advanced =================

    /** Freecam: sinkronkan state kamera dengan toggle config (hotkey maupun launcher live). */
    private static void runFreecam(MinecraftClient client, PlumConfig cfg) {
        if (cfg.freecamEnabled) {
            if (!Freecam.active && client.player != null && client.world != null) {
                Freecam.activate(client, cfg);
            }
            if (Freecam.active) {
                Freecam.moveTick(client, cfg);
                Freecam.applyFreeze(client, cfg);
            }
        } else if (Freecam.active) {
            Freecam.deactivate(client);
        }
    }

    // ================= Criticals / NoSlow =================

    /** Criticals: lompatan mini/normal vanilla saat target dekat dan cooldown siap, agar serangan berikutnya jatuh sebagai critical. Tanpa paket posisi palsu. */
    private static void runCriticals(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.criticalsEnabled || client.currentScreen != null || client.player == null) return;
        if (client.player.isDead() || client.player.isSpectator() || client.player.isUsingItem()) return;
        if (!client.player.isOnGround() || client.player.isTouchingWater() || client.player.isInLava()
                || client.player.isClimbing() || client.player.isGliding() || client.player.getAbilities().flying) return;
        LivingEntity target = null;
        if (client.crosshairTarget instanceof EntityHitResult hit && hit.getEntity() instanceof LivingEntity living && living.isAlive()) {
            target = living;
        } else if (auraTarget != null && auraTarget.isAlive()) {
            target = auraTarget;
        }
        if (target == null || client.player.distanceTo(target) > 4.5D) return;
        if (!client.options.attackKey.isPressed() && !cfg.killAuraEnabled) return;
        if (client.player.getAttackCooldownProgress(0.0F) < 0.8F) return;
        long now = System.currentTimeMillis();
        if (now - lastCritMillis < Math.max(100, Math.min(1000, cfg.criticalsCooldownMs))) return;
        lastCritMillis = now;
        Vec3d vel = client.player.getVelocity();
        double hop = "jump".equals(cfg.criticalsMode) ? 0.42D : 0.11D;
        client.player.setVelocity(vel.x, hop, vel.z);
    }

    /** NoSlow: pertahankan sprint dan kompensasi kecepatan horizontal kecil selama memakai item. Gerakan tetap input pemain sendiri. */
    private static void runNoSlow(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.noSlowEnabled || client.currentScreen != null || client.player == null) return;
        if (!client.player.isUsingItem() || client.player.isDead() || client.player.isSpectator()) return;
        if (!client.options.forwardKey.isPressed()) return;
        if (cfg.noSlowKeepSprint) client.player.setSprinting(true);
        Vec3d look = client.player.getRotationVec(1.0F);
        Vec3d flat = new Vec3d(look.x, 0.0D, look.z);
        if (flat.lengthSquared() < 1e-6D) return;
        Vec3d vel = client.player.getVelocity();
        double horizontal = Math.hypot(vel.x, vel.z);
        if (horizontal >= 0.26D) return;
        Vec3d add = flat.normalize().multiply(0.018D);
        client.player.setVelocity(vel.x + add.x, vel.y, vel.z + add.z);
    }

    // ================= AutoTotem =================

    /** AutoTotem: pindahkan totem ke offhand saat HP di bawah ambang (atau selalu), satu swap per jeda, hanya layar pemain. */
    private static void runAutoTotem(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoTotemEnabled || client.player == null || client.interactionManager == null) return;
        if (client.player.isDead() || client.player.isSpectator()) return;
        ScreenHandler handler = client.player.currentScreenHandler;
        if (handler == null || handler != client.player.playerScreenHandler || handler.slots.size() <= 45) return;
        if (client.player.getOffHandStack().isOf(Items.TOTEM_OF_UNDYING)) return;
        if (!cfg.autoTotemAlways && client.player.getHealth() > Math.max(1, Math.min(20, cfg.autoTotemHealth))) return;
        long now = System.currentTimeMillis();
        if (now - lastTotemMillis < Math.max(50, Math.min(1000, cfg.autoTotemDelayMs))) return;
        for (Slot slot : handler.slots) {
            if (slot.inventory != client.player.getInventory() || slot.id < 9 || slot.id > 44) continue;
            if (!slot.getStack().isOf(Items.TOTEM_OF_UNDYING)) continue;
            boolean offhandEmpty = client.player.getOffHandStack().isEmpty();
            client.interactionManager.clickSlot(handler.syncId, slot.id, 0, SlotActionType.PICKUP, client.player);
            client.interactionManager.clickSlot(handler.syncId, 45, 0, SlotActionType.PICKUP, client.player);
            if (!offhandEmpty) client.interactionManager.clickSlot(handler.syncId, slot.id, 0, SlotActionType.PICKUP, client.player);
            lastTotemMillis = now;
            return;
        }
    }

    // ================= InvManager =================

    /** InvManager konservatif: satu aksi per jeda — rapikan senjata terbaik ke hotbar-0, buang duplikat senjata/armor/tool yang jelas lebih lemah. Item terenchant tidak dibuang. */
    private static void runInvManager(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.invManagerEnabled || client.player == null || client.interactionManager == null) return;
        if (client.player.isDead() || client.player.isSpectator()) return;
        ScreenHandler handler = client.player.currentScreenHandler;
        if (handler == null || handler != client.player.playerScreenHandler) return;
        long now = System.currentTimeMillis();
        if (now - lastInvMillis < Math.max(50, Math.min(1000, cfg.invManagerDelayMs))) return;
        if (cfg.invManagerSortHotbar && sortBestWeaponToHotbar(client, handler)) {
            lastInvMillis = now;
            return;
        }
        if (cfg.invManagerDropDuplicates && dropWorseDuplicate(client, handler)) {
            lastInvMillis = now;
        }
    }

    private static boolean sortBestWeaponToHotbar(MinecraftClient client, ScreenHandler handler) {
        int bestSlot = -1;
        double bestScore = weaponScore(client, client.player.getInventory().getStack(0));
        for (Slot slot : handler.slots) {
            if (slot.inventory != client.player.getInventory() || slot.id < 9 || slot.id > 44) continue;
            double score = weaponScore(client, slot.getStack());
            if (score > bestScore + 0.01D) {
                bestScore = score;
                bestSlot = slot.id;
            }
        }
        if (bestSlot < 0 || bestSlot == 36) return false;
        boolean targetEmpty = handler.getSlot(36).getStack().isEmpty();
        client.interactionManager.clickSlot(handler.syncId, bestSlot, 0, SlotActionType.PICKUP, client.player);
        client.interactionManager.clickSlot(handler.syncId, 36, 0, SlotActionType.PICKUP, client.player);
        if (!targetEmpty) client.interactionManager.clickSlot(handler.syncId, bestSlot, 0, SlotActionType.PICKUP, client.player);
        return true;
    }

    private static boolean dropWorseDuplicate(MinecraftClient client, ScreenHandler handler) {
        Map<String, Double> bestByCategory = new HashMap<>();
        Map<String, Integer> bestSlotByCategory = new HashMap<>();
        for (Slot slot : handler.slots) {
            if (slot.inventory != client.player.getInventory() || slot.id < 9) continue;
            String category = gearCategory(client, slot.getStack());
            if (category == null) continue;
            double score = gearScore(client, slot.getStack(), category);
            if (score > bestByCategory.getOrDefault(category, -1.0D)) {
                bestByCategory.put(category, score);
                bestSlotByCategory.put(category, slot.id);
            }
        }
        for (Slot slot : handler.slots) {
            if (slot.inventory != client.player.getInventory() || slot.id < 9 || slot.id > 44) continue;
            ItemStack stack = slot.getStack();
            if (stack.hasEnchantments()) continue;
            String category = gearCategory(client, stack);
            if (category == null) continue;
            Integer bestSlot = bestSlotByCategory.get(category);
            if (bestSlot == null || bestSlot == slot.id) continue;
            if (client.player.getInventory().getStack(client.player.getInventory().getSelectedSlot()).equals(stack)) continue;
            if (gearScore(client, stack, category) < bestByCategory.get(category) - 0.01D) {
                client.interactionManager.clickSlot(handler.syncId, slot.id, 1, SlotActionType.THROW, client.player);
                return true;
            }
        }
        return false;
    }

    private static String gearCategory(MinecraftClient client, ItemStack stack) {
        if (stack == null || stack.isEmpty()) return null;
        if (stack.getItem() instanceof SwordItem) return "sword";
        if (stack.getItem() instanceof AxeItem) return "axe";
        if (stack.getItem() instanceof PickaxeItem) return "pickaxe";
        if (stack.getItem() instanceof ShovelItem) return "shovel";
        if (stack.getItem() instanceof HoeItem) return "hoe";
        if (stack.getItem() instanceof TridentItem) return "trident";
        if (stack.getItem() instanceof MaceItem) return "mace";
        var equippable = stack.get(DataComponentTypes.EQUIPPABLE);
        if (equippable != null) return "armor:" + equippable.slot().name();
        return null;
    }

    private static double gearScore(MinecraftClient client, ItemStack stack, String category) {
        if (category.startsWith("armor:")) {
            String slotName = category.substring("armor:".length());
            for (EquipmentSlot slot : EquipmentSlot.values()) {
                if (slot.name().equals(slotName)) return armorScore(stack, slot, config());
            }
            return -1.0D;
        }
        double weapon = weaponScore(client, stack);
        if (weapon > 0.0D) return weapon;
        String path = net.minecraft.registry.Registries.ITEM.getId(stack.getItem()).getPath();
        double tier = path.contains("netherite") ? 50.0D : path.contains("diamond") ? 40.0D
                : path.contains("iron") ? 30.0D : path.contains("stone") ? 20.0D
                : path.contains("golden") ? 15.0D : 10.0D;
        return tier + stack.getMaxDamage() / 500.0D;
    }

    // ================= AutoFish / AutoMine =================

    /** AutoFish: tarik saat bobber tenggelam tiba-tiba di air (indikasi gigitan), lempar lagi setelah jeda. Hanya dengan joran di tangan utama. */
    private static void runAutoFish(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoFishEnabled || client.currentScreen != null || client.player == null) {
            return;
        }
        if (client.player.isDead() || client.player.isSpectator()) return;
        if (!client.player.getMainHandStack().isOf(Items.FISHING_ROD)) return;
        long now = System.currentTimeMillis();
        var hook = client.player.fishHook;
        MinecraftClientAccessor accessor = (MinecraftClientAccessor) client;
        if (hook != null && hook.getPlayerOwner() == client.player) {
            if (hook.isTouchingWater() && hook.getVelocity().y < -0.22D && now - lastFishMillis > 400L) {
                accessor.plumcraft$doItemUse();
                lastFishMillis = now;
                fishRecastAtMillis = now + Math.max(200, Math.min(2000, cfg.autoFishRecastMs));
            }
            return;
        }
        if (hook == null && now - lastFishMillis > 800L && (fishRecastAtMillis == 0L || now >= fishRecastAtMillis)) {
            accessor.plumcraft$doItemUse();
            lastFishMillis = now;
            fishRecastAtMillis = 0L;
        }
    }

    /** AutoMine: tahan attack vanilla pada blok crosshair (tool dipilih AutoTool), berhenti saat GUI/durability menipis; ore-assist memutar ke ore highlight terdekat. */
    private static void runAutoMine(MinecraftClient client, PlumConfig cfg) {
        if (!cfg.autoMineEnabled || client.player == null || client.world == null) {
            releaseMineKey(client);
            return;
        }
        if (client.currentScreen != null || client.player.isDead() || client.player.isSpectator()) {
            releaseMineKey(client);
            return;
        }
        if (cfg.autoClickToolGuard && !toolHasDurability(client, cfg.autoClickMinDurability)) {
            releaseMineKey(client);
            return;
        }
        if (cfg.autoMineOreAssist && !(client.crosshairTarget instanceof BlockHitResult)) {
            aimAtNearestOre(client, cfg);
        }
        if (client.crosshairTarget instanceof BlockHitResult hit) {
            BlockState state = client.world.getBlockState(hit.getBlockPos());
            if (!client.player.isCreative() && state.getHardness(client.world, hit.getBlockPos()) < 0.0F) {
                releaseMineKey(client);
                return;
            }
            client.options.attackKey.setPressed(true);
            mineKeyForced = true;
        } else {
            releaseMineKey(client);
        }
    }

    private static void releaseMineKey(MinecraftClient client) {
        if (mineKeyForced && client != null && client.options != null) {
            client.options.attackKey.setPressed(false);
        }
        mineKeyForced = false;
    }

    private static void aimAtNearestOre(MinecraftClient client, PlumConfig cfg) {
        int range = Math.max(4, Math.min(32, cfg.autoMineScanRange));
        BlockPos best = null;
        double bestDist = Double.MAX_VALUE;
        for (BlockPos pos : OreTracker.highlightPositions(client, cfg)) {
            double dist = Math.sqrt(pos.getSquaredDistance(client.player.getBlockPos()));
            if (dist <= range && dist < bestDist) {
                bestDist = dist;
                best = pos;
            }
        }
        if (best == null) return;
        double dx = best.getX() + 0.5D - client.player.getEyePos().x;
        double dy = best.getY() + 0.5D - client.player.getEyePos().y;
        double dz = best.getZ() + 0.5D - client.player.getEyePos().z;
        double distXZ = Math.sqrt(dx * dx + dz * dz);
        if (distXZ < 1e-4D) return;
        float wantYaw = (float) (MathHelper.atan2(dz, dx) * 57.29577951308232D) - 90.0F;
        float wantPitch = (float) (-(MathHelper.atan2(dy, distXZ) * 57.29577951308232D));
        float yawStep = MathHelper.clamp(MathHelper.wrapDegrees(wantYaw - client.player.getYaw()), -30.0F, 30.0F);
        float pitchStep = MathHelper.clamp(MathHelper.wrapDegrees(wantPitch - client.player.getPitch()), -30.0F, 30.0F);
        client.player.setYaw(client.player.getYaw() + yawStep);
        client.player.setPitch(MathHelper.clamp(client.player.getPitch() + pitchStep, -90.0F, 90.0F));
    }
}
