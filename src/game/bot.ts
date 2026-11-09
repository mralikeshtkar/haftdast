// Heuristic bot. It only ever looks at a PlayerView, so it sees exactly what a
// human in that seat would see: no peeking at hidden cards.

import { type CardId, type Suit, RANKS, SUITS, rankOf, suitOf } from "./cards";
import { type PlayerView, partnerOf, winningPlay } from "./engine";

const HONOUR_WEIGHT: Partial<Record<number, number>> = { 14: 4, 13: 3, 12: 2, 11: 1 };

/** Pick a trump from the first five cards: favour long suits with honours. */
export function botChooseTrump(hand: CardId[]): Suit {
  let best: Suit = SUITS[0];
  let bestScore = -1;
  for (const s of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === s);
    const score =
      cards.length * 3 + cards.reduce((sum, c) => sum + (HONOUR_WEIGHT[rankOf(c)] ?? 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Rough worth of a card for hand-building: trumps and honours are valuable, long suits help. */
function cardWorth(card: CardId, hand: CardId[], trump: Suit): number {
  const s = suitOf(card);
  const r = rankOf(card);
  const suitLen = hand.filter((c) => suitOf(c) === s).length;
  if (s === trump) return 20 + r;
  return r + (HONOUR_WEIGHT[r] ?? 0) + suitLen * 0.6;
}

/** 2 players: pick the `count` least valuable cards to throw away. */
export function botChooseDiscards(hand: CardId[], trump: Suit, count: number): CardId[] {
  return hand
    .slice()
    .sort((a, b) => cardWorth(a, hand, trump) - cardWorth(b, hand, trump))
    .slice(0, count);
}

/** 2 players: keep the offered stock card, or gamble on the unseen next one? */
export function botDrawKeep(hand: CardId[], trump: Suit, offered: CardId): boolean {
  const s = suitOf(offered);
  const r = rankOf(offered);
  if (s === trump) return true;
  if (r >= 12) return true; // Q, K, A
  const suitLen = hand.filter((c) => suitOf(c) === s).length;
  if (r === 11 && suitLen >= 1) return true;
  if (r >= 9 && suitLen >= 3) return true; // supports a long suit
  return false;
}

export function botChooseCard(view: PlayerView): CardId {
  const legal = view.legal;
  if (legal.length === 1) return legal[0];
  const trump = view.trump as Suit;
  const n = view.config.players;
  const me = view.seat;
  const partner = partnerOf(me, n);

  const visible = new Set<CardId>([...view.hand, ...view.played]);

  /** Higher cards of the same suit that could still be in someone else's hand. */
  const higherUnseen = (card: CardId) =>
    RANKS.filter((r) => r > rankOf(card) && !visible.has(`${suitOf(card)}${r}`)).length;
  const isBoss = (card: CardId) => higherUnseen(card) === 0;

  const bySuit = (cards: CardId[], s: Suit) => cards.filter((c) => suitOf(c) === s);
  const lowest = (cards: CardId[]) =>
    cards.slice().sort((a, b) => rankOf(a) - rankOf(b))[0];
  const highest = (cards: CardId[]) =>
    cards.slice().sort((a, b) => rankOf(b) - rankOf(a))[0];
  const suitLength = (s: Suit) => bySuit(legal, s).length;

  /** Throw away the least valuable card: low rank, short non-trump suit. */
  const discard = (cards: CardId[]) => {
    const nonTrump = cards.filter((c) => suitOf(c) !== trump);
    const pool = nonTrump.length ? nonTrump : cards;
    return pool
      .slice()
      .sort((a, b) => {
        const d = rankOf(a) - rankOf(b);
        return d !== 0 ? d : suitLength(suitOf(a)) - suitLength(suitOf(b));
      })[0];
  };

  // ---- Leading ----
  if (view.currentTrick.length === 0) {
    const nonTrump = legal.filter((c) => suitOf(c) !== trump);
    const bosses = nonTrump.filter(isBoss);
    if (bosses.length) return highest(bosses);

    const trumps = bySuit(legal, trump);
    const trumpBoss = trumps.find(isBoss);
    if (trumpBoss && trumps.length >= 4) return trumpBoss;

    if (nonTrump.length) {
      // Lead low from the longest side suit.
      const longest = SUITS.filter((s) => s !== trump).sort(
        (a, b) => suitLength(b) - suitLength(a),
      )[0];
      const cards = bySuit(nonTrump, longest);
      return lowest(cards.length ? cards : nonTrump);
    }
    return lowest(trumps);
  }

  // ---- Following ----
  const winner = winningPlay(view.currentTrick, trump);
  const partnerWinning = partner !== null && winner.seat === partner;
  const lastToPlay = view.currentTrick.length === n - 1;
  const led = suitOf(view.currentTrick[0].card);
  const following = legal.every((c) => suitOf(c) === led);

  const beats = (card: CardId) => {
    const ws = suitOf(winner.card);
    const cs = suitOf(card);
    if (cs === ws) return rankOf(card) > rankOf(winner.card);
    return cs === trump; // a trump beats any non-trump winner
  };

  if (following) {
    if (partnerWinning && (lastToPlay || isBoss(winner.card))) return lowest(legal);
    const beaters = legal.filter(beats);
    if (beaters.length) return lastToPlay ? lowest(beaters) : highest(beaters);
    return lowest(legal);
  }

  // Void in the led suit.
  if (partnerWinning) return discard(legal);
  const trumpBeaters = bySuit(legal, trump).filter(beats);
  if (trumpBeaters.length) return lowest(trumpBeaters);
  return discard(legal);
}
