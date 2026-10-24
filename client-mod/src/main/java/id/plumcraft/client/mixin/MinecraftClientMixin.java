package id.plumcraft.client.mixin;

import id.plumcraft.client.ClickTracker;
import id.plumcraft.client.PlumClientMod;
import net.minecraft.client.MinecraftClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Menjalankan logika per-tick PlumClient tanpa dependensi Fabric API. */
@Mixin(MinecraftClient.class)
public abstract class MinecraftClientMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void plumcraft$tick(CallbackInfo ci) {
        PlumClientMod.onClientTick((MinecraftClient) (Object) this);
    }

    @Inject(method = "doAttack", at = @At("HEAD"))
    private void plumcraft$countAttack(CallbackInfoReturnable<Boolean> cir) {
        ClickTracker.recordLeft();
    }

    @Inject(method = "doItemUse", at = @At("HEAD"))
    private void plumcraft$countUse(CallbackInfo ci) {
        ClickTracker.recordRight();
    }
}
