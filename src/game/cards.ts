// Card primitives. A card is encoded as a string id like "S14" (ace of spades)
// so game state stays JSON-serialisable for the network layer.

export type Suit = "S" | "H" | "D" | "C";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type CardId = string;

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function cardId(suit: Suit, rank: Rank): CardId {
  return `${suit}${rank}`;
}

export function suitOf(id: CardId): Suit {
  return id[0] as Suit;
}

export function rankOf(id: CardId): Rank {
  return Number(id.slice(1)) as Rank;
}

export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(cardId(s, r));
  return deck;
}

export type Rng = () => number;

/** Fisher–Yates shuffle, returns a new array. */
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Small deterministic PRNG (mulberry32) for reproducible deals. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sort for display: by suit (trump first when given), then rank descending. */
export function sortHand(hand: CardId[], trump: Suit | null): CardId[] {
  const order: Suit[] = trump
    ? [trump, ...SUITS.filter((s) => s !== trump)]
    : SUITS.slice();
  // Alternate colours when no trump is set, so adjacent suits are distinguishable.
  const idx = (s: Suit) => order.indexOf(s);
  return hand
    .slice()
    .sort((a, b) =>
      idx(suitOf(a)) !== idx(suitOf(b))
        ? idx(suitOf(a)) - idx(suitOf(b))
        : rankOf(b) - rankOf(a),
    );
}
