"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type CardId, type Suit, rankOf, suitOf } from "@/game/cards";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_NAME: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME: Record<number, string> = { 11: "jack", 12: "queen", 13: "king", 14: "ace" };
const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

/**
 * Card artwork is served with a one-year cache lifetime, so the URL carries a version:
 * bump it whenever a file under public/cards changes.
 */
const CARD_ASSET_VERSION = "2";

/**
 * Card face artwork: public-domain vector-playing-cards, see public/cards/LICENSE.txt.
 * Number cards and aces are tiny SVGs; the jack/queen/king SVGs are huge (up to 1 MB),
 * so those are shipped as WebP rendered by scripts/gen-face-webp.mjs.
 */
export function cardImage(card: CardId): string {
  const r = rankOf(card);
  const ext = r >= 11 && r <= 13 ? "webp" : "svg";
  return `/cards/${RANK_NAME[r] ?? r}_of_${SUIT_NAME[suitOf(card)]}.${ext}?v=${CARD_ASSET_VERSION}`;
}

export const CARD_BACK = `/cards/back.svg?v=${CARD_ASSET_VERSION}`;

export function rankLabel(card: CardId): string {
  return RANK_LABEL[rankOf(card)] ?? String(rankOf(card));
}

export function isRed(suit: Suit) {
  return suit === "H" || suit === "D";
}

const RETRY_DELAYS_MS = [600, 1500, 3000, 6000];

/**
 * <img> that (1) retries when the network drops the request (common on mobile data;
 * browsers never retry a failed image on their own) and (2) shows `fallback` until the
 * picture has actually arrived, so a card is readable from the first frame on a slow link.
 */
function ResilientImg({ src, fallback }: { src: string; fallback?: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (src !== prevSrc) {
    // New card for this element: reset the retry state (adjust-state-on-prop-change pattern).
    setPrevSrc(src);
    setCurrentSrc(src);
    setAttempt(0);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onError = () => {
    if (attempt >= RETRY_DELAYS_MS.length) return;
    timer.current = setTimeout(() => {
      // Blank then reset the same URL so the browser issues a fresh request.
      setCurrentSrc("");
      requestAnimationFrame(() => setCurrentSrc(src));
      setAttempt((a) => a + 1);
    }, RETRY_DELAYS_MS[attempt]);
  };

  const loaded = loadedSrc === src;
  return (
    <>
      {!loaded && fallback}
      <img
        // An image served from cache can be complete before `load` is observed.
        ref={(img) => {
          if (img && img.complete && img.naturalWidth > 0 && img.getAttribute("src") === src) {
            setLoadedSrc((prev) => (prev === src ? prev : src));
          }
        }}
        src={currentSrc || undefined}
        alt=""
        draggable={false}
        onLoad={() => setLoadedSrc(src)}
        onError={onError}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </>
  );
}

interface CardProps {
  card?: CardId | null; // undefined/null renders the card back
  legal?: boolean;
  selected?: boolean;
  /** Lifted as part of a multi-card pick (no scaling). */
  picked?: boolean;
  dim?: boolean;
  width?: number;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export function Card({
  card,
  legal,
  selected,
  picked,
  dim,
  width,
  onClick,
  className = "",
  style,
  title,
}: CardProps) {
  const vars = width ? ({ "--card-w": `${width}px` } as React.CSSProperties) : {};
  if (!card) {
    return (
      <div className={`card back ${className}`} style={{ ...vars, ...style }} aria-hidden>
        <ResilientImg src={CARD_BACK} />
      </div>
    );
  }
  const suit = suitOf(card);
  const rank = rankLabel(card);
  const label = `${rank}${SUIT_SYMBOL[suit]}`;
  return (
    <button
      type="button"
      className={`card ${legal ? "legal" : ""} ${selected ? "selected" : ""} ${picked ? "picked" : ""} ${dim ? "dim" : ""} ${className}`}
      aria-pressed={selected || picked}
      style={{ ...vars, ...style }}
      onClick={legal ? onClick : undefined}
      disabled={!legal && !!onClick}
      aria-label={label}
      title={title ?? label}
    >
      <ResilientImg
        src={cardImage(card)}
        fallback={
          // Plain-text face shown until the artwork arrives.
          <span className={`card-fallback ${isRed(suit) ? "red" : ""}`} aria-hidden>
            <span className="idx">
              <span>{rank}</span>
              <span className="suit">{SUIT_SYMBOL[suit]}</span>
            </span>
            <span className="suit big">{SUIT_SYMBOL[suit]}</span>
          </span>
        }
      />
    </button>
  );
}
