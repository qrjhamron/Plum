package id.plumcraft.client;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.Perspective;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * State kamera bebas Freecam: posisi/sudut kamera hidup di sini, bukan di pemain,
 * supaya badan pemain tetap di tempat asalnya selama kamera berkeliling.
 * Mouse dialihkan ke state ini oleh mixin changeLookDirection, dan CameraMixin
 * menimpa posisi kamera render dengan state ini tiap frame.
 */
public final class Freecam {
    public static boolean active;
    public static double x;
    public static double y;
    public static double z;
    public static float yaw;
    public static float pitch;

    private static Vec3d anchor;
    private static Perspective savedPerspective;

    private Freecam() {
    }

    public static void activate(MinecraftClient client, PlumConfig cfg) {
        if (client == null || client.player == null) return;
        Vec3d eye = client.player.getEyePos();
        x = eye.x;
        y = eye.y;
        z = eye.z;
        yaw = client.player.getYaw();
        pitch = client.player.getPitch();
        anchor = client.player.getPos();
        active = true;
        savedPerspective = null;
        if (cfg.freecamShowPlayer && client.options != null
                && client.options.getPerspective() == Perspective.FIRST_PERSON) {
            savedPerspective = client.options.getPerspective();
            client.options.setPerspective(Perspective.THIRD_PERSON_BACK);
        }
    }

    public static void deactivate(MinecraftClient client) {
        active = false;
        anchor = null;
        if (savedPerspective != null && client != null && client.options != null) {
            client.options.setPerspective(savedPerspective);
        }
        savedPerspective = null;
    }

    /** Putar sudut kamera dengan faktor mouse vanilla yang sama (0.15 per delta). */
    public static void rotate(double cursorDeltaX, double cursorDeltaY) {
        yaw += (float) (cursorDeltaX * 0.15D);
        pitch = MathHelper.clamp(pitch + (float) (cursorDeltaY * 0.15D), -90.0F, 90.0F);
    }

    public static Vec3d pos() {
        return new Vec3d(x, y, z);
    }

    /** Gerakkan kamera dari tombol gerak pemain relatif ke arah pandang kamera. */
    public static void moveTick(MinecraftClient client, PlumConfig cfg) {
        if (!active || client.player == null) return;
        double forward = axis(client.options.forwardKey.isPressed(), client.options.backKey.isPressed());
        double strafe = axis(client.options.leftKey.isPressed(), client.options.rightKey.isPressed());
        double vertical = axis(client.options.jumpKey.isPressed(), client.options.sneakKey.isPressed());
        if (forward == 0.0D && strafe == 0.0D && vertical == 0.0D) return;
        double speed = 0.45D * Math.max(0.2D, Math.min(3.0D, cfg.freecamSpeed));
        if (client.options.sprintKey.isPressed()) speed *= 2.5D;
        Vec3d look = Vec3d.fromPolar(pitch, yaw);
        Vec3d side = new Vec3d(look.z, 0.0D, -look.x).normalize();
        Vec3d wish = look.multiply(forward).add(side.multiply(strafe)).add(0.0D, vertical, 0.0D);
        if (wish.lengthSquared() < 1e-8D) return;
        wish = wish.normalize().multiply(speed);
        x += wish.x;
        y += wish.y;
        z += wish.z;
    }

    /** Bekukan pemain di titik aktivasi selama freeze aktif (posisi + velocity dikunci tiap tick). */
    public static void applyFreeze(MinecraftClient client, PlumConfig cfg) {
        if (!active || !cfg.freecamFreeze || anchor == null || client.player == null) return;
        if (client.player.getPos().squaredDistanceTo(anchor) > 1.0e-6D) {
            client.player.setPosition(anchor);
        }
        client.player.setVelocity(Vec3d.ZERO);
        client.player.fallDistance = 0.0F;
    }

    private static double axis(boolean positive, boolean negative) {
        return (positive ? 1.0D : 0.0D) - (negative ? 1.0D : 0.0D);
    }
}
