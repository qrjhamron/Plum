package id.plumcraft.client.mixin;

import id.plumcraft.client.PlumClientMod;
import id.plumcraft.client.PlumConfig;
import net.minecraft.client.render.BackgroundRenderer;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.Fog;
import net.minecraft.client.render.FogShape;
import org.joml.Vector4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** AntiFog: mode full menghilangkan kabut; mode partial mendorong jarak fog sejauh faktor konfigurasi. */
@Mixin(BackgroundRenderer.class)
public abstract class BackgroundRendererMixin {
    @Inject(method = "applyFog", at = @At("HEAD"), cancellable = true)
    private static void plumcraft$antiFog(Camera camera, BackgroundRenderer.FogType fogType, Vector4f color,
                                          float viewDistance, boolean thickenFog, float tickDelta,
                                          CallbackInfoReturnable<Fog> cir) {
        PlumConfig cfg = PlumClientMod.config();
        if (!cfg.antiFogEnabled) return;
        if ("partial".equals(cfg.antiFogMode)) {
            float start = viewDistance * Math.max(2, Math.min(10, cfg.antiFogFactor));
            cir.setReturnValue(new Fog(start, start + 50.0F, FogShape.SPHERE, color.x, color.y, color.z, color.w));
        } else {
            cir.setReturnValue(new Fog(9999.0F, 10000.0F, FogShape.SPHERE, color.x, color.y, color.z, color.w));
        }
    }
}
