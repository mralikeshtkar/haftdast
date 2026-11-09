"use client";

import { useCallback, useSyncExternalStore } from "react";
import { loadString, saveString } from "./storage";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

/**
 * localStorage-backed string that is SSR-safe: the server (and first client render)
 * sees the fallback, then React swaps in the stored value without a hydration mismatch.
 */
export function useStoredString(key: string, fallback = ""): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => loadString(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (v: string) => {
      saveString(key, v);
      emit();
    },
    [key],
  );
  return [value, set];
}

/** Whether the browser has offered a PWA install prompt we can trigger. */
export function useInstallable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("pwa:installable", cb);
      window.addEventListener("pwa:installed", cb);
      return () => {
        window.removeEventListener("pwa:installable", cb);
        window.removeEventListener("pwa:installed", cb);
      };
    },
    () => !!window.__installPrompt,
    () => false,
  );
}
