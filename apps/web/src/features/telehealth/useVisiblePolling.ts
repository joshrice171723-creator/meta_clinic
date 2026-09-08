import { useEffect } from "react";

export function useVisiblePolling(
  refresh: () => Promise<void>,
  enabled = true,
  delayMs = 5_000,
) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number | undefined;
    const clear = () => window.clearTimeout(timer);
    const schedule = () => {
      clear();
      if (!disposed && document.visibilityState === "visible")
        timer = window.setTimeout(run, delayMs);
    };
    const run = async () => {
      clear();
      if (disposed || document.visibilityState !== "visible") return;
      try {
        await refresh();
      } catch {
        // The caller owns the visible error state; polling continues below.
      } finally {
        schedule();
      }
    };
    const onVisibility = () => {
      clear();
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      disposed = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs, enabled, refresh]);
}
