// Pure, serialisable Hokm engine supporting the 2, 3 and 4 player variants.
// Every function returns a new state object; nothing here touches the DOM or network.

import {
  type CardId,
  type Rng,
  type Suit,
  fullDeck,
  rankOf,
  shuffle,
  suitOf,
} from "./cards";

export type PlayerCount = 2 | 3 | 4;

export type Phase =
  | "lobby" // waiting for players
  | "choosingTrump" // hakem holds 5 cards and must pick a suit
  | "discarding" // 2 players: hakem discards 3 of 5, opponent 2 of 5
  | "drawing" // 2 players: alternate keep/discard draws from the stock up to 13 cards
  | "playing"
  | "handEnd" // a hand (round) finished, scores updated
  | "gameEnd";

/** What a player saw on their last draw turn (only they know it). */
export interface DrawSeen {
  kept: CardId;
  burned: CardId;
}

export interface DrawState {
  turn: number;
  lastSeen: (DrawSeen | null)[]; // per seat
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
}

export interface GameConfig {
  players: PlayerCount;
  /** Team score needed to win the whole game (default 7). */
  targetScore: number;
}

export interface TrickPlay {
  seat: number;
  card: CardId;
}

export interface HandResult {
  winnerTeam: number; // -1 on a draw
  hakemSeat: number;
  tricks: number[]; // per team
  points: number; // 1 normal, 2 kot, 3 hakem kot, 0 draw
  kind: "normal" | "kot" | "hakemKot" | "draw";
}

export interface GameState {
  config: GameConfig;
  players: Player[]; // index == seat
  phase: Phase;
  hakem: number;
  trump: Suit | null;
  hands: CardId[][]; // index == seat
  /** Undealt cards: the rest of the deal, or the stock during the 2-player draw. */
  deck: CardId[];
  /** 2 players: cards each seat still has to discard. */
  discardsNeeded: number[];
  /** 2 players: state of the draw phase, null otherwise. */
  draw: DrawState | null;
  currentTrick: TrickPlay[];
  leader: number;
  turn: number;
  /** Tricks taken in the current hand, per team. */
  tricks: number[];
  /** Overall score (hands won, weighted by kot), per team. */
  scores: number[];
  /** Cards already played this hand, for card counting. */
  played: CardId[];
  /** The last completed trick, kept so the UI can show it briefly. */
  lastTrick: { plays: TrickPlay[]; winner: number } | null;
  lastHand: HandResult | null;
  handNumber: number;
}

// ---------- Variant rules ----------

export interface VariantRules {
  teams: number;
  cardsPerPlayer: number;
  tricksToWin: number;
  totalTricks: number;
  /** 2 players: discard-then-draw deal (hakem discards 3, opponent 2, then alternate draws). */
  draft: boolean;
}

export function rulesFor(players: PlayerCount): VariantRules {
  switch (players) {
    case 4:
      return { teams: 2, cardsPerPlayer: 13, tricksToWin: 7, totalTricks: 13, draft: false };
    case 3:
      // One deuce is removed: 51 cards, 17 each. 9 tricks always wins, but the hand ends
      // earlier once a lead is unreachable; see checkThreePlayerEnd.
      return { teams: 3, cardsPerPlayer: 17, tricksToWin: 9, totalTricks: 17, draft: false };
    case 2:
      // 5 cards each; hakem discards 3 and the opponent 2; then they alternate drawing
      // from the 42-card stock (keep the top card and burn the next, or burn the top card
      // and take the next) until it runs out, leaving 13 each. First to 7 of 13 tricks.
      return { teams: 2, cardsPerPlayer: 13, tricksToWin: 7, totalTricks: 13, draft: true };
  }
}

export const HAKEM_DISCARDS = 3;
export const OPPONENT_DISCARDS = 2;

/** Seconds the hand-result screen stays before the next hand starts automatically. */
export const AUTO_NEXT_HAND_SECONDS = 3;

export function teamOf(seat: number, players: PlayerCount): number {
  return players === 4 ? seat % 2 : seat;
}

export function partnerOf(seat: number, players: PlayerCount): number | null {
  return players === 4 ? (seat + 2) % 4 : null;
}

export function nextSeat(seat: number, players: PlayerCount): number {
  return (seat + 1) % players;
}

// ---------- Creation ----------

export function createGame(config: GameConfig, players: Player[]): GameState {
  const rules = rulesFor(config.players);
  return {
    config,
    players: players.slice().sort((a, b) => a.seat - b.seat),
    phase: "lobby",
    hakem: 0,
    trump: null,
    hands: Array.from({ length: config.players }, () => []),
    deck: [],
    discardsNeeded: Array(config.players).fill(0),
    draw: null,
    currentTrick: [],
    leader: 0,
    turn: 0,
    tricks: Array(rules.teams).fill(0),
    scores: Array(rules.teams).fill(0),
    played: [],
    lastTrick: null,
    lastHand: null,
    handNumber: 0,
  };
}

/**
 * Traditional hakem selection: cards are dealt one at a time and the first
 * player to receive an ace becomes hakem. Returns the seat.
 */
export function pickFirstHakem(players: PlayerCount, rng: Rng = Math.random): number {
  const deck = shuffle(fullDeck(), rng);
  for (let i = 0; i < deck.length; i++) {
    if (rankOf(deck[i]) === 14) return i % players;
  }
  return 0;
}

/** Start a new hand: shuffle, give the hakem their first 5 cards, wait for trump. */
export function startHand(state: GameState, rng: Rng = Math.random, hakem?: number): GameState {
  const n = state.config.players;
  const rules = rulesFor(n);
  let deck = shuffle(fullDeck(), rng);

  if (n === 3) {
    const idx = deck.findIndex((c) => rankOf(c) === 2);
    deck = deck.filter((_, i) => i !== idx);
  }

  const h = hakem ?? state.hakem;
  const hands: CardId[][] = Array.from({ length: n }, () => []);
  hands[h] = deck.slice(0, 5);
  let dealt = 5;
  const discardsNeeded = Array(n).fill(0);
  if (rules.draft) {
    // 2 players: both get their 5 cards up front; the rest is the stock.
    const other = nextSeat(h, n);
    hands[other] = deck.slice(5, 10);
    dealt = 10;
    discardsNeeded[h] = HAKEM_DISCARDS;
    discardsNeeded[other] = OPPONENT_DISCARDS;
  }

  return {
    ...state,
    phase: "choosingTrump",
    hakem: h,
    trump: null,
    hands,
    deck: deck.slice(dealt),
    discardsNeeded,
    draw: null,
    currentTrick: [],
    leader: h,
    turn: h,
    tricks: Array(rules.teams).fill(0),
    played: [],
    lastTrick: null,
    handNumber: state.handNumber + 1,
  };
}

/** Hakem picks the trump suit; remaining cards are dealt and play begins. */
export function chooseTrump(state: GameState, suit: Suit): GameState {
  if (state.phase !== "choosingTrump") throw new Error("not choosing trump");
  const n = state.config.players;
  const rules = rulesFor(n);

  if (rules.draft) {
    // 2 players: no further deal yet; both players discard first.
    return { ...state, phase: "discarding", trump: suit };
  }

  const deck = state.deck.slice();
  const hands = state.hands.map((h) => h.slice());

  // Deal in rounds of 4 starting from the hakem, as at a real table.
  let seat = state.hakem;
  while (hands.some((h) => h.length < rules.cardsPerPlayer)) {
    const need = Math.min(4, rules.cardsPerPlayer - hands[seat].length);
    if (need > 0) hands[seat].push(...deck.splice(0, need));
    seat = nextSeat(seat, n);
  }

  return {
    ...state,
    phase: "playing",
    trump: suit,
    hands,
    deck: [], // whatever is left is out of play for this hand
    currentTrick: [],
    leader: state.hakem,
    turn: state.hakem,
  };
}

// ---------- 2-player discard & draw ----------

/** A seat discards exactly the number of cards it owes; when both are done the draw begins. */
export function discardCards(state: GameState, seat: number, cards: CardId[]): GameState {
  if (state.phase !== "discarding") throw new Error("not discarding");
  const need = state.discardsNeeded[seat];
  if (need === 0) throw new Error("already discarded");
  if (cards.length !== need) throw new Error(`must discard ${need} cards`);
  const hand = state.hands[seat];
  if (new Set(cards).size !== cards.length || cards.some((c) => !hand.includes(c))) {
    throw new Error("cards not in hand");
  }
  const hands = state.hands.map((h) => h.slice());
  hands[seat] = hand.filter((c) => !cards.includes(c));
  const discardsNeeded = state.discardsNeeded.slice();
  discardsNeeded[seat] = 0;

  const allDone = discardsNeeded.every((d) => d === 0);
  return {
    ...state,
    hands,
    discardsNeeded,
    phase: allDone ? "drawing" : "discarding",
    draw: allDone ? { turn: state.hakem, lastSeen: Array(state.config.players).fill(null) } : null,
  };
}

/** The card currently offered to the drawing player (top of the stock). */
export function offeredCard(state: GameState): CardId | null {
  return state.phase === "drawing" ? (state.deck[0] ?? null) : null;
}

/**
 * Draw decision: keep the offered top card (the next one is burned, unseen), or burn
 * the offered card and take the next one, sight unseen. Two stock cards go per turn.
 * The burned card is recorded in state only; players never get to see it.
 */
export function drawDecision(state: GameState, seat: number, keep: boolean): GameState {
  if (state.phase !== "drawing" || !state.draw) throw new Error("not drawing");
  if (state.draw.turn !== seat) throw new Error("not your draw");
  const [first, second, ...rest] = state.deck;
  if (first === undefined || second === undefined) throw new Error("stock exhausted");

  const kept = keep ? first : second;
  const burned = keep ? second : first;
  const hands = state.hands.map((h) => h.slice());
  hands[seat].push(kept);

  const lastSeen = state.draw.lastSeen.slice();
  lastSeen[seat] = { kept, burned };
  const n = state.config.players;

  if (rest.length === 0) {
    return {
      ...state,
      hands,
      deck: [],
      draw: null,
      phase: "playing",
      leader: state.hakem,
      turn: state.hakem,
    };
  }
  return {
    ...state,
    hands,
    deck: rest,
    draw: { turn: nextSeat(seat, n), lastSeen },
  };
}

// ---------- Play ----------

export function legalMoves(state: GameState, seat: number): CardId[] {
  if (state.phase !== "playing" || state.turn !== seat) return [];
  const hand = state.hands[seat];
  if (state.currentTrick.length === 0) return hand;
  const led = suitOf(state.currentTrick[0].card);
  const following = hand.filter((c) => suitOf(c) === led);
  return following.length > 0 ? following : hand;
}

/** Which play currently wins the (possibly incomplete) trick. */
export function winningPlay(plays: TrickPlay[], trump: Suit): TrickPlay {
  let best = plays[0];
  for (const p of plays.slice(1)) {
    const bs = suitOf(best.card);
    const ps = suitOf(p.card);
    if (ps === bs) {
      if (rankOf(p.card) > rankOf(best.card)) best = p;
    } else if (ps === trump) {
      best = p;
    }
  }
  return best;
}

export function playCard(state: GameState, seat: number, card: CardId): GameState {
  const legal = legalMoves(state, seat);
  if (!legal.includes(card)) throw new Error("illegal move");
  const n = state.config.players;
  const trump = state.trump as Suit;

  const hands = state.hands.map((h) => h.slice());
  hands[seat].splice(hands[seat].indexOf(card), 1);

  const currentTrick = [...state.currentTrick, { seat, card }];
  const played = [...state.played, card];

  if (currentTrick.length < n) {
    return {
      ...state,
      hands,
      currentTrick,
      played,
      turn: nextSeat(seat, n),
      lastTrick: null,
    };
  }

  // Trick complete: award it.
  const winner = winningPlay(currentTrick, trump);
  const tricks = state.tricks.slice();
  const wTeam = teamOf(winner.seat, n);
  tricks[wTeam] += 1;

  const next: GameState = {
    ...state,
    hands,
    currentTrick: [],
    played,
    tricks,
    leader: winner.seat,
    turn: winner.seat,
    lastTrick: { plays: currentTrick, winner: winner.seat },
  };

  if (n === 3) return checkThreePlayerEnd(next);

  if (tricks[wTeam] >= rulesFor(n).tricksToWin) return finishHand(next, wTeam);
  return next;
}

/**
 * Three-player ending (Pagat): a player who takes the first 7 tricks wins at once (kot);
 * otherwise the hand ends as soon as one player's trick count can no longer be matched
 * or exceeded by anyone else. If the top two are tied when the cards run out, the third
 * player wins the hand.
 */
function checkThreePlayerEnd(state: GameState): GameState {
  const { tricks } = state;
  const taken = tricks.reduce((a, b) => a + b, 0);
  const remaining = rulesFor(3).totalTricks - taken;

  const kotSeat = tricks.findIndex((t, i) => t >= 7 && tricks.every((o, j) => j === i || o === 0));
  if (kotSeat >= 0) return finishHand(state, kotSeat);

  const unreachable = tricks.findIndex((t, i) => tricks.every((o, j) => j === i || o + remaining < t));
  if (unreachable >= 0) return finishHand(state, unreachable);

  if (remaining === 0) {
    // Only reachable when the top two are tied: the third player takes the hand.
    const min = Math.min(...tricks);
    return finishHand(state, tricks.indexOf(min));
  }
  return state;
}

function finishHand(state: GameState, winnerTeam: number | null): GameState {
  const n = state.config.players;
  const hakemTeam = teamOf(state.hakem, n);

  if (winnerTeam === null) {
    return {
      ...state,
      phase: "handEnd",
      lastHand: {
        winnerTeam: -1,
        hakemSeat: state.hakem,
        tricks: state.tricks.slice(),
        points: 0,
        kind: "draw",
      },
    };
  }

  const othersTook = state.tricks.reduce((sum, t, i) => (i === winnerTeam ? sum : sum + t), 0);

  let kind: HandResult["kind"] = "normal";
  let points = 1;
  if (othersTook === 0) {
    if (winnerTeam !== hakemTeam) {
      kind = "hakemKot";
      points = 3;
    } else {
      kind = "kot";
      points = 2;
    }
  }

  const scores = state.scores.slice();
  scores[winnerTeam] += points;

  // Hakem keeps the role while their team wins; otherwise it passes to the next player
  // (in the 2-player game that is the winner).
  const nextHakem = winnerTeam === hakemTeam ? state.hakem : nextSeat(state.hakem, n);

  return {
    ...state,
    phase: scores[winnerTeam] >= state.config.targetScore ? "gameEnd" : "handEnd",
    scores,
    hakem: nextHakem,
    lastHand: {
      winnerTeam,
      hakemSeat: state.hakem,
      tricks: state.tricks.slice(),
      points,
      kind,
    },
  };
}

/** Reset scores and start over with the same players. */
export function resetGame(state: GameState): GameState {
  return { ...createGame(state.config, state.players), hakem: state.hakem };
}

// ---------- Views ----------

/** What one seat is allowed to know: other hands are reduced to counts. */
export interface PlayerView {
  config: GameConfig;
  players: Player[];
  phase: Phase;
  hakem: number;
  trump: Suit | null;
  seat: number;
  hand: CardId[];
  handCounts: number[];
  /** 2 players: how many cards each seat still has to discard. */
  discardsNeeded: number[];
  /**
   * 2 players: draw phase as seen by this seat (offered card only on their turn).
   * `lastKept` is the card this seat received on its previous draw turn; the burned
   * card is never sent to clients.
   */
  draw: {
    turn: number;
    offered: CardId | null;
    stock: number;
    lastKept: CardId | null;
  } | null;
  currentTrick: TrickPlay[];
  leader: number;
  turn: number;
  tricks: number[];
  scores: number[];
  played: CardId[];
  lastTrick: GameState["lastTrick"];
  lastHand: HandResult | null;
  handNumber: number;
  legal: CardId[];
}

export function viewFor(state: GameState, seat: number): PlayerView {
  return {
    config: state.config,
    players: state.players,
    phase: state.phase,
    hakem: state.hakem,
    trump: state.trump,
    seat,
    hand: state.hands[seat] ?? [],
    handCounts: state.hands.map((h) => h.length),
    discardsNeeded: state.discardsNeeded,
    draw: state.draw
      ? {
          turn: state.draw.turn,
          offered: state.draw.turn === seat ? offeredCard(state) : null,
          stock: state.deck.length,
          lastKept: state.draw.lastSeen[seat]?.kept ?? null,
        }
      : null,
    currentTrick: state.currentTrick,
    leader: state.leader,
    turn: state.turn,
    tricks: state.tricks,
    scores: state.scores,
    played: state.played,
    lastTrick: state.lastTrick,
    lastHand: state.lastHand,
    handNumber: state.handNumber,
    legal: legalMoves(state, seat),
  };
}
