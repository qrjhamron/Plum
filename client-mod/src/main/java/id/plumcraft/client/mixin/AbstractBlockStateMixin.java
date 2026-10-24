package id.plumcraft.client.mixin;

import id.plumcraft.client.PlumClientMod;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.util.math.Direction;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Xray stabil: selain {@code Block.shouldDrawSide} (lihat {@link BlockMixin}),
 * culling antar-blok lewat {@code AbstractBlockState.isSideInvisible} juga
 * dioverride. Tanpa ini, face blok non-target yang bersebelahan dengan blok
 * padat lain masih bisa digambar (Z-fighting / tembus tidak konsisten).
 *
 * <p>Saat Xray aktif: face milik blok non-target selalu invisible, face milik
 * blok target selalu visible. Saat Xray mati: logika vanilla dipakai.
 */
@Mixin(AbstractBlock.AbstractBlockState.class)
public abstract class AbstractBlockStateMixin {
    @Shadow
    public abstract Block getBlock();

    @Inject(method = "isSideInvisible", at = @At("HEAD"), cancellable = true)
    private void plumcraft$xrayCull(BlockState state, Direction direction,
                                    CallbackInfoReturnable<Boolean> cir) {
        if (PlumClientMod.config().xrayEnabled) {
            cir.setReturnValue(!PlumClientMod.config().isXrayBlock(this.getBlock()));
        }
    }
}
