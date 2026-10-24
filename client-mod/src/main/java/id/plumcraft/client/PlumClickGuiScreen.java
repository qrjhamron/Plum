package id.plumcraft.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * ClickGUI in-game PlumClient (Right Shift): panel kategori Combat/Movement/
 * Player/Render/World, pencarian modul, scroll, dan toggle animasi.
 * Setiap toggle langsung menulis config/plumclient.json lewat cfg.save(),
 * jadi sinkron dengan panel launcher. Hanya untuk singleplayer, world sendiri,
 * atau server yang secara eksplisit mengizinkan modul client-side.
 */
public final class PlumClickGuiScreen extends Screen {
    private record Entry(String name, String category, BooleanSupplier get, Consumer<Boolean> set) {
        boolean matches(String query) {
            return query.isEmpty() || name.toLowerCase(Locale.ROOT).contains(query);
        }
    }

    private record Panel(String title, List<Entry> entries) {
    }

    private static final int PANEL_W = 122;
    private static final int ROW_H = 15;
    private static final int HEADER_H = 18;

    private final List<Panel> panels = new ArrayList<>();
    private final Map<String, Float> animation = new HashMap<>();
    private String search = "";
    private int startRow;

    public PlumClickGuiScreen() {
        super(Text.literal("PlumClient ClickGUI"));
        buildPanels();
    }

    private void buildPanels() {
        List<Entry> combat = new ArrayList<>();
        combat.add(entry("KillAura", "Combat", () -> PlumClientMod.config().killAuraEnabled, v -> PlumClientMod.config().killAuraEnabled = v));
        combat.add(entry("Criticals", "Combat", () -> PlumClientMod.config().criticalsEnabled, v -> PlumClientMod.config().criticalsEnabled = v));
        combat.add(entry("AutoClick", "Combat", () -> PlumClientMod.config().autoClickEnabled, v -> PlumClientMod.config().autoClickEnabled = v));
        combat.add(entry("Triggerbot", "Combat", () -> PlumClientMod.config().triggerbotEnabled, v -> PlumClientMod.config().triggerbotEnabled = v));
        combat.add(entry("AutoWeapon", "Combat", () -> PlumClientMod.config().autoWeaponEnabled, v -> PlumClientMod.config().autoWeaponEnabled = v));
        combat.add(entry("AutoBow", "Combat", () -> PlumClientMod.config().autoBowEnabled, v -> PlumClientMod.config().autoBowEnabled = v));
        combat.add(entry("Velocity", "Combat", () -> PlumClientMod.config().velocityEnabled, v -> PlumClientMod.config().velocityEnabled = v));
        combat.add(entry("AutoTotem", "Combat", () -> PlumClientMod.config().autoTotemEnabled, v -> PlumClientMod.config().autoTotemEnabled = v));

        List<Entry> movement = new ArrayList<>();
        movement.add(entry("Sprint", "Movement", () -> PlumClientMod.config().sprintEnabled, v -> PlumClientMod.config().sprintEnabled = v));
        movement.add(entry("NoSlow", "Movement", () -> PlumClientMod.config().noSlowEnabled, v -> PlumClientMod.config().noSlowEnabled = v));
        movement.add(entry("NoFall", "Movement", () -> PlumClientMod.config().noFallEnabled, v -> PlumClientMod.config().noFallEnabled = v));
        movement.add(entry("Scaffold", "Movement", () -> PlumClientMod.config().scaffoldEnabled, v -> PlumClientMod.config().scaffoldEnabled = v));
        movement.add(entry("Jesus", "Movement", () -> PlumClientMod.config().jesusEnabled, v -> PlumClientMod.config().jesusEnabled = v));
        movement.add(entry("Freecam", "Movement", () -> PlumClientMod.config().freecamEnabled, v -> PlumClientMod.config().freecamEnabled = v));

        List<Entry> player = new ArrayList<>();
        player.add(entry("AutoArmor", "Player", () -> PlumClientMod.config().autoArmorEnabled, v -> PlumClientMod.config().autoArmorEnabled = v));
        player.add(entry("AutoTool", "Player", () -> PlumClientMod.config().autoToolEnabled, v -> PlumClientMod.config().autoToolEnabled = v));
        player.add(entry("InvManager", "Player", () -> PlumClientMod.config().invManagerEnabled, v -> PlumClientMod.config().invManagerEnabled = v));
        player.add(entry("AutoFish", "Player", () -> PlumClientMod.config().autoFishEnabled, v -> PlumClientMod.config().autoFishEnabled = v));
        player.add(entry("AutoMine", "Player", () -> PlumClientMod.config().autoMineEnabled, v -> PlumClientMod.config().autoMineEnabled = v));
        player.add(entry("Chest Stealer", "Player", () -> PlumClientMod.config().chestStealerEnabled, v -> PlumClientMod.config().chestStealerEnabled = v));

        List<Entry> render = new ArrayList<>();
        render.add(entry("Xray", "Render", () -> PlumClientMod.config().xrayEnabled, v -> {
            PlumClientMod.config().xrayEnabled = v;
            MinecraftClient client = MinecraftClient.getInstance();
            if (client != null && client.worldRenderer != null) client.worldRenderer.reload();
        }));
        render.add(entry("AutoBright", "Render", () -> PlumClientMod.config().autoBrightEnabled, v -> PlumClientMod.config().autoBrightEnabled = v));
        render.add(entry("ESP", "Render", () -> PlumClientMod.config().espEnabled, v -> PlumClientMod.config().espEnabled = v));
        render.add(entry("Tracers", "Render", () -> PlumClientMod.config().tracersEnabled, v -> PlumClientMod.config().tracersEnabled = v));
        render.add(entry("Trajectories", "Render", () -> PlumClientMod.config().trajectoriesEnabled, v -> PlumClientMod.config().trajectoriesEnabled = v));
        render.add(entry("NameTags", "Render", () -> PlumClientMod.config().nameTagsEnabled, v -> PlumClientMod.config().nameTagsEnabled = v));
        render.add(entry("Chams", "Render", () -> PlumClientMod.config().chamsEnabled, v -> PlumClientMod.config().chamsEnabled = v));
        render.add(entry("Crosshair", "Render", () -> PlumClientMod.config().crosshairEnabled, v -> PlumClientMod.config().crosshairEnabled = v));
        render.add(entry("AntiFog", "Render", () -> PlumClientMod.config().antiFogEnabled, v -> PlumClientMod.config().antiFogEnabled = v));
        render.add(entry("HUD", "Render", () -> PlumClientMod.config().hudEnabled, v -> PlumClientMod.config().hudEnabled = v));

        List<Entry> world = new ArrayList<>();
        world.add(entry("Chest Finder", "World", () -> PlumClientMod.config().chestFinderEnabled, v -> PlumClientMod.config().chestFinderEnabled = v));
        world.add(entry("Stronghold", "World", () -> PlumClientMod.config().strongholdFinderEnabled, v -> PlumClientMod.config().strongholdFinderEnabled = v));
        world.add(entry("Discord RPC", "World", () -> PlumClientMod.config().discordRpcEnabled, v -> PlumClientMod.config().discordRpcEnabled = v));

        panels.add(new Panel("Combat", combat));
        panels.add(new Panel("Movement", movement));
        panels.add(new Panel("Player", player));
        panels.add(new Panel("Render", render));
        panels.add(new Panel("World", world));
    }

    private static Entry entry(String name, String category, BooleanSupplier get, Consumer<Boolean> set) {
        return new Entry(name, category, get, set);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        renderBackground(context, mouseX, mouseY, delta);
        String query = search.toLowerCase(Locale.ROOT);
        context.drawCenteredTextWithShadow(textRenderer, "PlumClient ClickGUI", width / 2, 8, 0xA78BFA);
        String hint = "Cari: " + (search.isEmpty() ? "(klik lalu ketik)" : search + "_") + "  |  Right Shift / ESC tutup  |  Scroll geser";
        context.drawCenteredTextWithShadow(textRenderer, hint, width / 2, 20, 0xC9CED6);
        int columns = Math.max(1, (width - 12) / (PANEL_W + 8));
        int maxVisibleRows = Math.max(3, (height - 70) / ROW_H);
        int idx = 0;
        for (Panel panel : panels) {
            List<Entry> visible = panel.entries().stream().filter(e -> e.matches(query)).toList();
            if (visible.isEmpty()) continue;
            int col = idx % columns;
            int rowBand = idx / columns;
            int x = 8 + col * (PANEL_W + 8);
            int y = 36 + rowBand * (HEADER_H + maxVisibleRows * ROW_H + 14);
            drawPanel(context, panel.title(), visible, x, y, maxVisibleRows, mouseX, mouseY);
            idx++;
        }
        if (idx == 0) {
            context.drawCenteredTextWithShadow(textRenderer, "Tidak ada modul cocok: " + search, width / 2, height / 2, 0xFF5555);
        }
    }

    private void drawPanel(DrawContext context, String title, List<Entry> entries, int x, int y, int maxVisibleRows, int mouseX, int mouseY) {
        int rows = Math.min(maxVisibleRows, Math.max(0, entries.size() - startRow));
        int panelH = HEADER_H + rows * ROW_H + 4;
        context.fill(x, y, x + PANEL_W, y + panelH, 0xCC171A21);
        context.fill(x, y, x + PANEL_W, y + HEADER_H, 0xFF7C5CFF);
        context.drawTextWithShadow(textRenderer, title, x + 6, y + 5, 0xFFFFFF);
        for (int i = 0; i < rows; i++) {
            Entry e = entries.get(startRow + i);
            int ry = y + HEADER_H + i * ROW_H;
            boolean hover = mouseX >= x && mouseX < x + PANEL_W && mouseY >= ry && mouseY < ry + ROW_H;
            boolean on = e.get().getAsBoolean();
            float anim = animation.getOrDefault(e.name(), on ? 1.0F : 0.0F);
            anim += ((on ? 1.0F : 0.0F) - anim) * 0.25F;
            animation.put(e.name(), anim);
            context.fill(x + 1, ry, x + PANEL_W - 1, ry + ROW_H - 1, hover ? 0xFF2B303D : 0xFF22262F);
            context.drawTextWithShadow(textRenderer, e.name(), x + 6, ry + 4, on ? 0xFFFFFF : 0x9AA4B4);
            int pillW = 22;
            int pillX = x + PANEL_W - pillW - 5;
            int pillColor = anim > 0.5F ? 0xFF3FB97F : 0xFF4A5160;
            context.fill(pillX, ry + 3, pillX + pillW, ry + ROW_H - 4, pillColor);
            int knobX = pillX + 2 + Math.round((pillW - 10) * anim);
            context.fill(knobX, ry + 4, knobX + 7, ry + ROW_H - 5, 0xFFFFFFFF);
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);
        String query = search.toLowerCase(Locale.ROOT);
        int columns = Math.max(1, (width - 12) / (PANEL_W + 8));
        int maxVisibleRows = Math.max(3, (height - 70) / ROW_H);
        int idx = 0;
        for (Panel panel : panels) {
            List<Entry> visible = panel.entries().stream().filter(e -> e.matches(query)).toList();
            if (visible.isEmpty()) continue;
            int col = idx % columns;
            int rowBand = idx / columns;
            int x = 8 + col * (PANEL_W + 8);
            int y = 36 + rowBand * (HEADER_H + maxVisibleRows * ROW_H + 14);
            int rows = Math.min(maxVisibleRows, Math.max(0, visible.size() - startRow));
            for (int i = 0; i < rows; i++) {
                int ry = y + HEADER_H + i * ROW_H;
                if (mouseX >= x && mouseX < x + PANEL_W && mouseY >= ry && mouseY < ry + ROW_H) {
                    Entry e = visible.get(startRow + i);
                    e.set().accept(!e.get().getAsBoolean());
                    PlumConfig cfg = PlumClientMod.config();
                    cfg.save();
                    return true;
                }
            }
            idx++;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        int maxRows = panels.stream().mapToInt(p -> p.entries().size()).max().orElse(0);
        int maxVisibleRows = Math.max(3, (height - 70) / ROW_H);
        int maxStart = Math.max(0, maxRows - maxVisibleRows);
        startRow = Math.max(0, Math.min(maxStart, startRow + (verticalAmount < 0 ? 1 : -1)));
        return true;
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == GLFW.GLFW_KEY_ESCAPE || keyCode == GLFW.GLFW_KEY_RIGHT_SHIFT) {
            close();
            return true;
        }
        if (keyCode == GLFW.GLFW_KEY_BACKSPACE && !search.isEmpty()) {
            search = search.substring(0, search.length() - 1);
            startRow = 0;
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (chr >= 32 && chr < 127) {
            search += chr;
            startRow = 0;
            return true;
        }
        return super.charTyped(chr, modifiers);
    }
}
