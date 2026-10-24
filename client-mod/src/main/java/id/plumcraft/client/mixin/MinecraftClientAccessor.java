package id.plumcraft.client.mixin;

import net.minecraft.client.MinecraftClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** Akses terkontrol ke aksi klik vanilla untuk AutoClick. */
@Mixin(MinecraftClient.class)
public interface MinecraftClientAccessor {
    @Invoker("doAttack")
    boolean plumcraft$doAttack();

    @Invoker("doItemUse")
    void plumcraft$doItemUse();
}
