"use client";

import { useEffect, useRef, useState } from "react";
import { type CardId, type Suit, rankOf, suitOf } from "@/game/cards";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_NAME: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME: Record<number, string> = { 11: "jack", 12: "queen", 13: "king", 14: "ace" };
const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

/** Card face artwork: public-domain vector-playing-cards, see public/cards/LICENSE.txt */
export function cardImage(card: CardId): string {
  const r = rankOf(card);
  return `/cards/${RANK_NAME[r] ?? r}_of_${SUIT_NAME[suitOf(card)]}.svg`;
}

export const CARD_BACK = "/cards/back.svg";

export function rankLabel(card: CardId): string {
  return RANK_LABEL[rankOf(card)] ?? String(rankOf(card));
}

export function isRed(suit: Suit) {
  return suit === "H" || suit === "D";
}

const RETRY_DELAYS_MS = [600, 1500, 3000, 6000];

/**
 * <img> that retries when the network drops the request (common on mobile data
 * through a tunnel). Browsers never retry a failed image on their own.
 */
function ResilientImg({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState(src);
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

  return <img src={currentSrc} alt={alt} draggable={false} onError={onError} />;
}

interface CardProps {
  card?: CardId | null; // undefined/null renders the card back
  legal?: boolean;
  selected?: boolean;
  /** Lifted as part of a multi-card pick (no scaling). */
  picked?: boolean;
  /** Card is of the trump suit: shows a gold corner. */
  trump?: boolean;
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
  trump,
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
        <ResilientImg src={CARD_BACK} alt="" />
      </div>
    );
  }
  const label = `${rankLabel(card)}${SUIT_SYMBOL[suitOf(card)]}`;
  return (
    <button
      type="button"
      className={`card ${legal ? "legal" : ""} ${selected ? "selected" : ""} ${picked ? "picked" : ""} ${trump ? "trump" : ""} ${dim ? "dim" : ""} ${className}`}
      aria-pressed={selected || picked}
      style={{ ...vars, ...style }}
      onClick={legal ? onClick : undefined}
      disabled={!legal && !!onClick}
      aria-label={label}
      title={title ?? label}
    >
      <ResilientImg src={cardImage(card)} alt={label} />
    </button>
  );
}
