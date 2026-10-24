package id.plumcraft.client.mixin;

import id.plumcraft.client.PlumClientMod;
import id.plumcraft.client.TpsTracker;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.network.packet.s2c.play.EntityVelocityUpdateS2CPacket;
import net.minecraft.network.packet.s2c.play.WorldTimeUpdateS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Memberi data waktu game ke penghitung TPS dan velocity pemain ke modul Velocity. */
@Mixin(ClientPlayNetworkHandler.class)
public abstract class ClientPlayNetworkHandlerMixin {
    @Inject(method = "onWorldTimeUpdate", at = @At("TAIL"))
    private void plumcraft$tps(WorldTimeUpdateS2CPacket packet, CallbackInfo ci) {
        TpsTracker.onWorldTime(packet.time());
    }

    @Inject(method = "onEntityVelocityUpdate", at = @At("TAIL"))
    private void plumcraft$velocity(EntityVelocityUpdateS2CPacket packet, CallbackInfo ci) {
        PlumClientMod.handleVelocityApplied(packet.getEntityId());
    }
}
