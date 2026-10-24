package id.plumcraft.client;

/**
 * Estimasi TPS server dari paket pembaruan waktu dunia.
 * Server vanilla mengirim waktu game secara berkala; selisih tick game
 * dibagi waktu nyata menghasilkan TPS (maksimum 20).
 */
public final class TpsTracker {
    private static long lastGameTime = -1L;
    private static long lastRealNanos = -1L;
    private static double tps = 20.0D;

    private TpsTracker() {
    }

    public static synchronized void onWorldTime(long gameTime) {
        long now = System.nanoTime();
        if (lastGameTime >= 0L && lastRealNanos >= 0L) {
            long tickDelta = gameTime - lastGameTime;
            double seconds = (now - lastRealNanos) / 1_000_000_000.0D;
            // Abaikan pergantian world / lonjakan paket yang tidak wajar.
            if (tickDelta >= 0L && tickDelta <= 1200L && seconds >= 0.25D) {
                double instant = Math.max(0.0D, Math.min(20.0D, tickDelta / seconds));
                tps = (tps * 0.7D) + (instant * 0.3D);
            }
        }
        lastGameTime = gameTime;
        lastRealNanos = now;
    }

    public static synchronized void reset() {
        lastGameTime = -1L;
        lastRealNanos = -1L;
        tps = 20.0D;
    }

    public static synchronized double getTps() {
        return tps;
    }

    public static String format() {
        return String.format(java.util.Locale.ROOT, "%.1f", getTps());
    }
}
