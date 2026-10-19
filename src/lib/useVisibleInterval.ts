import { useEffect, useRef } from "react";

// Calls `callback` every `intervalMs` while the tab is visible. Hidden tabs
// skip their ticks, and a tab that comes back after missing one catches up
// straight away instead of waiting out a fresh interval.
export function useVisibleInterval(callback: () => void, intervalMs: number, enabled = true) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      callbackRef.current();
    };

    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= intervalMs) run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
