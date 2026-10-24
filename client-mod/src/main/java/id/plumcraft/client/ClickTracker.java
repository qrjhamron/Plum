package id.plumcraft.client;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Menghitung CPS nyata dari aksi attack/use yang benar-benar dijalankan game,
 * termasuk klik manual dan klik yang dihasilkan AutoClick.
 */
public final class ClickTracker {
    private static final long WINDOW_MS = 1000L;
    private static final Deque<Long> LEFT = new ArrayDeque<>();
    private static final Deque<Long> RIGHT = new ArrayDeque<>();

    private ClickTracker() {
    }

    public static synchronized void recordLeft() {
        LEFT.addLast(System.currentTimeMillis());
        prune(LEFT);
    }

    public static synchronized void recordRight() {
        RIGHT.addLast(System.currentTimeMillis());
        prune(RIGHT);
    }

    public static synchronized int leftCps() {
        prune(LEFT);
        return LEFT.size();
    }

    public static synchronized int rightCps() {
        prune(RIGHT);
        return RIGHT.size();
    }

    private static void prune(Deque<Long> clicks) {
        long cutoff = System.currentTimeMillis() - WINDOW_MS;
        while (!clicks.isEmpty() && clicks.peekFirst() < cutoff) {
            clicks.removeFirst();
        }
    }
}
