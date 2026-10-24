package id.plumcraft.client.mixin;

import id.plumcraft.client.Freecam;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Freecam: alihkan putaran mouse pemain lokal ke sudut kamera bebas, bukan badan pemain. */
@Mixin(Entity.class)
public abstract class EntityMixin {
    @Inject(method = "changeLookDirection", at = @At("HEAD"), cancellable = true)
    private void plumcraft$freecamLook(double cursorDeltaX, double cursorDeltaY, CallbackInfo ci) {
        if (!Freecam.active) return;
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || (Object) this != client.player) return;
        Freecam.rotate(cursorDeltaX, cursorDeltaY);
        ci.cancel();
    }
}
