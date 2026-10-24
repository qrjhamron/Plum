package id.plumcraft.client.mixin;

import id.plumcraft.client.Freecam;
import net.minecraft.client.render.Camera;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.BlockView;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Freecam: timpa posisi/sudut kamera render dengan state Freecam setelah update vanilla. */
@Mixin(Camera.class)
public abstract class CameraMixin {
    @Invoker("setPos")
    abstract void plumcraft$setPos(Vec3d pos);

    @Invoker("setRotation")
    abstract void plumcraft$setRotation(float yaw, float pitch);

    @Inject(method = "update", at = @At("TAIL"))
    private void plumcraft$freecam(BlockView area, Entity focusedEntity, boolean thirdPerson,
                                   boolean inverseView, float tickDelta, CallbackInfo ci) {
        if (!Freecam.active) return;
        plumcraft$setPos(Freecam.pos());
        plumcraft$setRotation(Freecam.yaw, Freecam.pitch);
    }
}
