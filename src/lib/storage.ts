"use client";

/** Small localStorage helpers that never throw (private mode, SSR, blocked storage). */

export function loadString(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Stable anonymous id for this browser, used to reclaim a seat after a reconnect. */
export function getPlayerId(): string {
  let id = loadString("playerId");
  if (!id) {
    id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    saveString("playerId", id);
  }
  return id;
}
