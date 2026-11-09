"use client";

import { fullDeck } from "@/game/cards";
import { CARD_BACK, cardImage } from "@/components/Card";

let started = false;

/**
 * Warm the browser (and service worker) cache with every card image, a few at a time,
 * so cards appear instantly during play even on a slow or flaky connection.
 * Safe to call many times; it only runs once per page load.
 */
export function preloadCards() {
  if (started || typeof window === "undefined") return;
  started = true;
  const urls = [CARD_BACK, ...fullDeck().map(cardImage)];
  let i = 0;
  const parallel = 3;
  const next = () => {
    if (i >= urls.length) return;
    const url = urls[i++];
    const img = new Image();
    img.onload = img.onerror = () => setTimeout(next, 50);
    img.src = url;
  };
  const start = () => {
    for (let k = 0; k < parallel; k++) next();
  };
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 500);
  }
}
