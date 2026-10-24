package id.plumcraft.client.mixin;

import id.plumcraft.client.PlumClientMod;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.world.BlockView;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Xray: saat aktif, hanya sisi blok target (ore) yang digambar. */
@Mixin(Block.class)
public abstract class BlockMixin {
    @Inject(method = "shouldDrawSide", at = @At("HEAD"), cancellable = true)
    private static void plumcraft$xray(BlockState state, BlockView world, BlockPos pos, Direction side, BlockPos otherPos,
                                       CallbackInfoReturnable<Boolean> cir) {
        if (PlumClientMod.config().xrayEnabled) {
            cir.setReturnValue(PlumClientMod.config().isXrayBlock(state.getBlock()));
        }
    }
}
