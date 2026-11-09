// Plays full bot-vs-bot games for every variant and checks engine invariants.
// Run with: npx tsx scripts/simulate.ts

import { seededRng } from "../src/game/cards";
import { botChooseCard, botChooseDiscards, botChooseTrump, botDrawKeep } from "../src/game/bot";
import {
  type GameState,
  type PlayerCount,
  chooseTrump,
  createGame,
  discardCards,
  drawDecision,
  offeredCard,
  pickFirstHakem,
  playCard,
  rulesFor,
  startHand,
  viewFor,
} from "../src/game/engine";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("assertion failed: " + msg);
}

function playGame(players: PlayerCount, seed: number) {
  const rng = seededRng(seed);
  const rules = rulesFor(players);
  let s: GameState = createGame(
    { players, targetScore: 7 },
    Array.from({ length: players }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      seat: i,
      isBot: true,
    })),
  );
  s = { ...s, hakem: pickFirstHakem(players, rng) };

  let hands = 0;
  let kots = 0;
  while (s.phase !== "gameEnd") {
    s = startHand(s, rng);
    assert(s.hands[s.hakem].length === 5, "hakem has 5 cards");
    s = chooseTrump(s, botChooseTrump(s.hands[s.hakem]));
    if (rules.draft) {
      assert(s.phase === "discarding", "2p discards after trump");
      for (let seat = 0; seat < players; seat++) {
        const need = s.discardsNeeded[seat];
        assert(need === (seat === s.hakem ? 3 : 2), "hakem 3, opponent 2");
        s = discardCards(s, seat, botChooseDiscards(s.hands[seat], s.trump!, need));
      }
      assert(s.phase === "drawing" && s.draw?.turn === s.hakem, "hakem draws first");
      let draws = 0;
      while (s.phase === "drawing") {
        const seat = s.draw!.turn;
        const view = viewFor(s, seat);
        assert(view.draw?.offered === offeredCard(s), "drawer sees the offered card");
        assert(viewFor(s, 1 - seat).draw?.offered === null, "other player does not");
        s = drawDecision(s, seat, botDrawKeep(s.hands[seat], s.trump!, view.draw!.offered!));
        draws++;
      }
      assert(draws === 21, "21 draw turns");
      assert(s.deck.length === 0, "stock exhausted");
    }
    assert(s.phase === "playing", "playing after deal");
    for (const h of s.hands) assert(h.length === rules.cardsPerPlayer, "dealt correctly");

    let plays = 0;
    while (s.phase === "playing") {
      const view = viewFor(s, s.turn);
      assert(view.legal.length > 0, "someone can always move");
      const card = botChooseCard(view);
      assert(view.legal.includes(card), "bot plays legal card");
      s = playCard(s, s.turn, card);
      plays++;
      assert(plays <= rules.totalTricks * players, "hand terminates");
    }
    hands++;
    assert(s.lastHand, "hand result recorded");
    const total = s.tricks.reduce((a, b) => a + b, 0);
    assert(total <= rules.totalTricks, "tricks within bounds");
    assert(s.lastHand.kind !== "draw", "no draws under Pagat rules");
    const w = s.lastHand.winnerTeam;
    if (players === 3) {
      const remaining = rules.totalTricks - total;
      const kot = s.tricks[w] >= 7 && s.tricks.every((t, i) => i === w || t === 0);
      const unreachable = s.tricks.every((t, i) => i === w || t + remaining < s.tricks[w]);
      const tieThird = remaining === 0 && s.tricks[w] === Math.min(...s.tricks);
      assert(kot || unreachable || tieThird, "3p hand ended for a valid reason");
      if (kot) assert(s.lastHand.points === (w === s.lastHand.hakemSeat ? 2 : 3), "3p kot points");
    } else {
      assert(s.tricks[w] === rules.tricksToWin, "winner hit threshold");
    }
    if (s.lastHand.kind === "kot" || s.lastHand.kind === "hakemKot") kots++;
    assert(hands < 100, "game terminates");
  }
  const winner = s.scores.findIndex((x) => x >= 7);
  assert(winner >= 0, "someone reached target");
  return { hands, kots, scores: s.scores };
}

for (const players of [2, 3, 4] as PlayerCount[]) {
  let totalHands = 0;
  let totalKots = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = playGame(players, seed * 7919 + players);
    totalHands += r.hands;
    totalKots += r.kots;
  }
  console.log(
    `${players} players: 30 games OK, avg ${(totalHands / 30).toFixed(1)} hands/game, ${totalKots} kots`,
  );
}
console.log("all good");
