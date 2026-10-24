package id.plumcraft.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.block.Block;
import net.minecraft.registry.Registries;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Konfigurasi PlumClient. Nama field sama persis dengan yang ditulis launcher. */
public final class PlumConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public boolean xrayEnabled = false;
    public List<String> xrayBlocks = new ArrayList<>(List.of(
            "minecraft:coal_ore", "minecraft:deepslate_coal_ore", "minecraft:iron_ore", "minecraft:deepslate_iron_ore",
            "minecraft:copper_ore", "minecraft:deepslate_copper_ore", "minecraft:gold_ore", "minecraft:deepslate_gold_ore",
            "minecraft:redstone_ore", "minecraft:deepslate_redstone_ore", "minecraft:lapis_ore", "minecraft:deepslate_lapis_ore",
            "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore", "minecraft:emerald_ore", "minecraft:deepslate_emerald_ore",
            "minecraft:nether_gold_ore", "minecraft:nether_quartz_ore", "minecraft:ancient_debris"));
    public boolean xrayHighlight = true;
    public int xrayRadius = 16;
    public int xrayMaxHighlights = 6;
    public boolean autoBrightEnabled = true;
    public boolean autoClickEnabled = false;
    public int autoClickCps = 10;
    public boolean autoClickHumanizer = true;
    public int autoClickCpsMin = 8;
    public int autoClickCpsMax = 14;
    public boolean autoClickSmoothAim = true;
    public double autoClickJitter = 1.0;
    public String autoClickMode = "attack";
    public String autoClickTarget = "either";
    public boolean autoClickCooldownSync = true;
    public boolean autoClickToolGuard = true;
    public int autoClickMinDurability = 5;
    public boolean showOreTracker = true;
    public boolean hudEnabled = true;
    public boolean showTps = true;
    public boolean showFps = true;
    public boolean showCps = true;
    public boolean showPing = true;
    public boolean showCoordinates = true;
    public boolean showBiome = true;
    public boolean showCompass = true;
    public boolean showArmor = true;
    public boolean showEffects = true;
    public boolean showSession = true;
    public boolean autoWeaponEnabled = false;
    public boolean autoBowEnabled = false;
    public int autoBowRange = 32;
    public boolean autoBowFullCharge = true;
    public boolean noFallEnabled = false;
    public boolean strongholdFinderEnabled = false;
    public boolean crosshairEnabled = false;
    public String crosshairStyle = "cross";
    public int crosshairSize = 8;
    public String crosshairColor = "white";
    public boolean espEnabled = false;
    public int espRange = 64;
    public String espTargets = "hostile";
    public boolean tracersEnabled = false;
    public int tracerRange = 64;
    public String tracerTargets = "hostile";
    public boolean chestFinderEnabled = false;
    public int chestRadius = 32;
    public boolean scaffoldEnabled = false;
    public boolean autoToolEnabled = false;
    public boolean discordRpcEnabled = false;
    public String discordAppId = "";
    public boolean jesusEnabled = false;
    public boolean chestStealerEnabled = false;
    public boolean antiFogEnabled = false;
    public boolean chamsEnabled = false;
    public boolean triggerbotEnabled = false;
    public boolean killAuraEnabled = false;
    public double killAuraRange = 4.5;
    public double killAuraScanRange = 6.0;
    public String killAuraTargets = "hostile";
    public String killAuraPriority = "distance";
    public String killAuraMode = "single";
    public int killAuraSwitchDelayMs = 250;
    public int killAuraFov = 120;
    public int killAuraRotationSpeed = 60;
    public int killAuraCps = 12;
    public boolean killAuraThroughWalls = false;
    public boolean killAuraIgnoreInvisible = true;
    public boolean killAuraSmartCrit = true;
    public boolean killAuraRequireCooldown = true;
    public boolean velocityEnabled = false;
    public String velocityMode = "reduce";
    public int velocityHorizontal = 20;
    public int velocityVertical = 100;
    public int velocityDelayTicks = 0;
    public boolean velocityJumpReset = false;
    public int velocityJumpResetChance = 30;
    public boolean velocityRequireMoving = false;
    public boolean sprintEnabled = false;
    public String sprintMode = "legit";
    public boolean sprintKeepSprint = true;
    public boolean sprintWhileUsing = false;
    public boolean autoArmorEnabled = false;
    public int autoArmorDelayMs = 150;
    public boolean autoArmorHotbarOnly = false;
    public boolean autoArmorPreferElytra = false;
    public boolean autoArmorDropOld = false;
    public boolean freecamEnabled = false;
    public double freecamSpeed = 1.0;
    public boolean freecamFreeze = true;
    public boolean freecamShowPlayer = true;
    public boolean jesusAffectWater = true;
    public boolean jesusAffectLava = true;
    public double jesusLift = 0.08;
    public boolean xrayExposedOnly = false;
    public boolean xrayValuableFirst = false;
    public double autoBrightGamma = 15.0;
    public boolean autoBrightFade = true;
    public int autoClickUseCpsMin = 8;
    public int autoClickUseCpsMax = 14;
    public int autoWeaponSwitchDelayMs = 150;
    public boolean autoWeaponEnchantWeight = true;
    public boolean autoBowPredictive = true;
    public int noFallMinDistance = 3;
    public int noFallIntervalMs = 100;
    public int strongholdMinSeparation = 8;
    public boolean crosshairDynamic = false;
    public boolean crosshairHitMarker = true;
    public boolean espShowHealth = false;
    public int tracerThickness = 2;
    public boolean tracerVisibleOnly = false;
    public String chestFinderTypes = "all";
    public int scaffoldDelayMs = 100;
    public boolean scaffoldTower = false;
    public int autoToolSwitchDelayMs = 100;
    public boolean autoToolPreferSilk = false;
    public boolean discordShowModules = false;
    public int chestStealerDelayMs = 75;
    public boolean chestStealerValuableOnly = false;
    public String antiFogMode = "full";
    public int antiFogFactor = 4;
    public boolean chamsTint = false;
    public int triggerbotDelayMinMs = 0;
    public int triggerbotDelayMaxMs = 80;
    public String triggerbotTargets = "hostile";
    public boolean hudActiveOnly = false;
    public boolean clickGuiEnabled = true;
    public boolean criticalsEnabled = false;
    public String criticalsMode = "mini";
    public int criticalsCooldownMs = 350;
    public boolean noSlowEnabled = false;
    public boolean noSlowKeepSprint = true;
    public boolean autoTotemEnabled = false;
    public int autoTotemHealth = 10;
    public int autoTotemDelayMs = 120;
    public boolean autoTotemAlways = false;
    public boolean trajectoriesEnabled = false;
    public int trajectoriesSteps = 80;
    public boolean nameTagsEnabled = false;
    public int nameTagsRange = 64;
    public String nameTagsTargets = "hostile";
    public boolean nameTagsShowHealth = true;
    public boolean nameTagsShowDistance = true;
    public boolean invManagerEnabled = false;
    public int invManagerDelayMs = 200;
    public boolean invManagerDropDuplicates = true;
    public boolean invManagerSortHotbar = true;
    public boolean autoFishEnabled = false;
    public int autoFishRecastMs = 600;
    public boolean autoMineEnabled = false;
    public boolean autoMineOreAssist = false;
    public int autoMineScanRange = 16;
    public int entityCacheMs = 50;

    private transient Set<String> xraySet;

    /** Stempel mtime file yang terakhir dibaca/ditulis mod; dipakai deteksi perubahan eksternal (launcher UI). */
    public static volatile long lastFileStamp = -1L;

    public static long currentFileStamp() {
        try {
            return Files.getLastModifiedTime(path()).toMillis();
        } catch (Exception ignored) {
            return -1L;
        }
    }

    public static Path path() {
        return FabricLoader.getInstance().getConfigDir().resolve("plumclient.json");
    }

    public static PlumConfig load() {
        PlumConfig cfg = new PlumConfig();
        try {
            Path p = path();
            if (Files.exists(p)) {
                try (Reader r = Files.newBufferedReader(p)) {
                    PlumConfig loaded = GSON.fromJson(r, PlumConfig.class);
                    if (loaded != null) cfg = loaded;
                }
                lastFileStamp = currentFileStamp();
            } else {
                cfg.save();
            }
        } catch (Exception ignored) {
            // Konfigurasi rusak tidak boleh menggagalkan game; pakai default.
        }
        return cfg.normalize();
    }

    public PlumConfig normalize() {
        xrayRadius = Math.max(8, Math.min(32, xrayRadius));
        xrayMaxHighlights = Math.max(1, Math.min(12, xrayMaxHighlights));
        autoClickCps = Math.max(1, Math.min(20, autoClickCps));
        autoClickCpsMin = Math.max(1, Math.min(20, autoClickCpsMin));
        autoClickCpsMax = Math.max(1, Math.min(20, autoClickCpsMax));
        if (autoClickCpsMax < autoClickCpsMin) autoClickCpsMax = autoClickCpsMin;
        autoClickJitter = Math.max(0.0D, Math.min(3.0D, autoClickJitter));
        if (!"attack".equals(autoClickMode) && !"use".equals(autoClickMode) && !"both".equals(autoClickMode)) {
            autoClickMode = "attack";
        }
        if (!"entity".equals(autoClickTarget) && !"block".equals(autoClickTarget) && !"either".equals(autoClickTarget)) {
            autoClickTarget = "either";
        }
        autoClickMinDurability = Math.max(1, Math.min(64, autoClickMinDurability));
        autoBowRange = Math.max(8, Math.min(64, autoBowRange));
        if (!"cross".equals(crosshairStyle) && !"dot".equals(crosshairStyle) && !"circle".equals(crosshairStyle) && !"crossdot".equals(crosshairStyle)) {
            crosshairStyle = "cross";
        }
        crosshairSize = Math.max(4, Math.min(20, crosshairSize));
        if (crosshairColor == null || !java.util.Set.of("white", "green", "red", "cyan", "purple", "yellow").contains(crosshairColor)) {
            crosshairColor = "white";
        }
        espRange = Math.max(8, Math.min(128, espRange));
        if (espTargets == null || !java.util.Set.of("hostile", "players", "all", "creatures").contains(espTargets)) espTargets = "hostile";
        tracerRange = Math.max(8, Math.min(128, tracerRange));
        if (tracerTargets == null || !java.util.Set.of("hostile", "players", "all", "creatures").contains(tracerTargets)) tracerTargets = "hostile";
        chestRadius = Math.max(8, Math.min(64, chestRadius));
        killAuraRange = Math.max(3.0D, Math.min(6.0D, killAuraRange));
        killAuraScanRange = Math.max(3.0D, Math.min(12.0D, killAuraScanRange));
        if (killAuraScanRange < killAuraRange) killAuraScanRange = killAuraRange;
        if (killAuraTargets == null || !java.util.Set.of("hostile", "players", "all", "creatures").contains(killAuraTargets)) killAuraTargets = "hostile";
        if (killAuraPriority == null || !java.util.Set.of("distance", "health", "angle", "hurttime").contains(killAuraPriority)) killAuraPriority = "distance";
        if (killAuraMode == null || !java.util.Set.of("single", "switch", "multi").contains(killAuraMode)) killAuraMode = "single";
        killAuraSwitchDelayMs = Math.max(0, Math.min(2000, killAuraSwitchDelayMs));
        killAuraFov = Math.max(30, Math.min(360, killAuraFov));
        killAuraRotationSpeed = Math.max(10, Math.min(180, killAuraRotationSpeed));
        killAuraCps = Math.max(1, Math.min(20, killAuraCps));
        if (velocityMode == null || !java.util.Set.of("reduce", "cancel").contains(velocityMode)) velocityMode = "reduce";
        velocityHorizontal = Math.max(0, Math.min(100, velocityHorizontal));
        velocityVertical = Math.max(0, Math.min(100, velocityVertical));
        velocityDelayTicks = Math.max(0, Math.min(10, velocityDelayTicks));
        velocityJumpResetChance = Math.max(1, Math.min(100, velocityJumpResetChance));
        if (sprintMode == null || !java.util.Set.of("legit", "omni").contains(sprintMode)) sprintMode = "legit";
        autoArmorDelayMs = Math.max(50, Math.min(1000, autoArmorDelayMs));
        freecamSpeed = Math.max(0.2D, Math.min(3.0D, freecamSpeed));
        jesusLift = Math.max(0.03D, Math.min(0.20D, jesusLift));
        autoBrightGamma = Math.max(1.0D, Math.min(15.0D, autoBrightGamma));
        autoClickUseCpsMin = Math.max(1, Math.min(20, autoClickUseCpsMin));
        autoClickUseCpsMax = Math.max(1, Math.min(20, autoClickUseCpsMax));
        if (autoClickUseCpsMax < autoClickUseCpsMin) autoClickUseCpsMax = autoClickUseCpsMin;
        autoWeaponSwitchDelayMs = Math.max(0, Math.min(1000, autoWeaponSwitchDelayMs));
        noFallMinDistance = Math.max(2, Math.min(12, noFallMinDistance));
        noFallIntervalMs = Math.max(50, Math.min(500, noFallIntervalMs));
        strongholdMinSeparation = Math.max(4, Math.min(32, strongholdMinSeparation));
        tracerThickness = Math.max(1, Math.min(4, tracerThickness));
        if (chestFinderTypes == null || !java.util.Set.of("all", "chests", "barrels", "shulkers").contains(chestFinderTypes)) chestFinderTypes = "all";
        scaffoldDelayMs = Math.max(50, Math.min(500, scaffoldDelayMs));
        autoToolSwitchDelayMs = Math.max(0, Math.min(500, autoToolSwitchDelayMs));
        chestStealerDelayMs = Math.max(25, Math.min(500, chestStealerDelayMs));
        if (antiFogMode == null || !java.util.Set.of("full", "partial").contains(antiFogMode)) antiFogMode = "full";
        antiFogFactor = Math.max(2, Math.min(10, antiFogFactor));
        triggerbotDelayMinMs = Math.max(0, Math.min(500, triggerbotDelayMinMs));
        triggerbotDelayMaxMs = Math.max(0, Math.min(500, triggerbotDelayMaxMs));
        if (triggerbotDelayMaxMs < triggerbotDelayMinMs) triggerbotDelayMaxMs = triggerbotDelayMinMs;
        if (triggerbotTargets == null || !java.util.Set.of("hostile", "players", "all", "creatures").contains(triggerbotTargets)) triggerbotTargets = "hostile";
        if (criticalsMode == null || !java.util.Set.of("mini", "jump").contains(criticalsMode)) criticalsMode = "mini";
        criticalsCooldownMs = Math.max(100, Math.min(1000, criticalsCooldownMs));
        autoTotemHealth = Math.max(1, Math.min(20, autoTotemHealth));
        autoTotemDelayMs = Math.max(50, Math.min(1000, autoTotemDelayMs));
        trajectoriesSteps = Math.max(20, Math.min(120, trajectoriesSteps));
        nameTagsRange = Math.max(8, Math.min(128, nameTagsRange));
        if (nameTagsTargets == null || !java.util.Set.of("hostile", "players", "all", "creatures").contains(nameTagsTargets)) nameTagsTargets = "hostile";
        invManagerDelayMs = Math.max(50, Math.min(1000, invManagerDelayMs));
        autoFishRecastMs = Math.max(200, Math.min(2000, autoFishRecastMs));
        autoMineScanRange = Math.max(4, Math.min(32, autoMineScanRange));
        entityCacheMs = Math.max(25, Math.min(250, entityCacheMs));
        if (discordAppId == null) discordAppId = "";
        if (xrayBlocks == null || xrayBlocks.isEmpty()) {
            xrayBlocks = new PlumConfig().xrayBlocks;
        }
        xraySet = new LinkedHashSet<>(xrayBlocks);
        return this;
    }

    public boolean isXrayBlock(Block block) {
        if (xraySet == null) normalize();
        return xraySet.contains(Registries.BLOCK.getId(block).toString());
    }

    public void save() {
        try {
            Path p = path();
            Files.createDirectories(p.getParent());
            try (Writer w = Files.newBufferedWriter(p)) {
                GSON.toJson(normalize(), w);
            }
            lastFileStamp = currentFileStamp();
        } catch (Exception ignored) {
            // Gagal menyimpan toggle tidak boleh crash.
        }
    }
}
