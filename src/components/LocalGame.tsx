"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardId, Suit } from "@/game/cards";
import { botChooseCard, botChooseDiscards, botChooseTrump, botDrawKeep } from "@/game/bot";
import {
  AUTO_NEXT_HAND_SECONDS,
  type GameState,
  type PlayerCount,
  chooseTrump,
  createGame,
  discardCards,
  drawDecision,
  offeredCard,
  pickFirstHakem,
  playCard,
  resetGame,
  startHand,
  viewFor,
} from "@/game/engine";
import { useI18n } from "@/i18n/context";
import { Table } from "./Table";

interface Props {
  players: PlayerCount;
  targetScore: number;
  name: string;
}

const ME = 0;

/** Single-device game: the human sits at seat 0, bots fill the rest. Runs fully offline. */
export function LocalGame({ players, targetScore, name }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<GameState>(() => {
    const seats = Array.from({ length: players }, (_, i) => ({
      id: `seat-${i}`,
      name: i === ME ? name : `${t.bot} ${i}`,
      seat: i,
      isBot: i !== ME,
    }));
    const game = createGame({ players, targetScore }, seats);
    return startHand({ ...game, hakem: pickFirstHakem(players) });
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive the bots. Delays make the table readable.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const isBot = (seat: number) => state.players[seat]?.isBot;
    const schedule = (ms: number, step: (s: GameState) => GameState) => {
      timer.current = setTimeout(() => setState((s) => step(s)), ms);
    };

    if (state.phase === "choosingTrump" && isBot(state.hakem)) {
      schedule(900, (s) =>
        s.phase === "choosingTrump" ? chooseTrump(s, botChooseTrump(s.hands[s.hakem])) : s,
      );
    } else if (state.phase === "discarding") {
      const seat = state.discardsNeeded.findIndex((d, i) => d > 0 && isBot(i));
      if (seat >= 0) {
        schedule(900, (s) =>
          s.phase === "discarding" && s.discardsNeeded[seat] > 0
            ? discardCards(s, seat, botChooseDiscards(s.hands[seat], s.trump as Suit, s.discardsNeeded[seat]))
            : s,
        );
      }
    } else if (state.phase === "drawing" && state.draw && isBot(state.draw.turn)) {
      schedule(650, (s) => {
        if (s.phase !== "drawing" || !s.draw || !isBot(s.draw.turn)) return s;
        const seat = s.draw.turn;
        const offered = offeredCard(s) as CardId;
        return drawDecision(s, seat, botDrawKeep(s.hands[seat], s.trump as Suit, offered));
      });
    } else if (state.phase === "playing" && isBot(state.turn)) {
      const afterTrick = state.currentTrick.length === 0 && state.lastTrick !== null;
      schedule(afterTrick ? 1500 : 650, (s) => {
        if (s.phase !== "playing" || !s.players[s.turn].isBot) return s;
        return playCard(s, s.turn, botChooseCard(viewFor(s, s.turn)));
      });
    } else if (state.phase === "handEnd") {
      // Show the result briefly, then deal the next hand on its own.
      schedule(AUTO_NEXT_HAND_SECONDS * 1000, (s) => (s.phase === "handEnd" ? startHand(s) : s));
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  const guard = (fn: (s: GameState) => GameState) =>
    setState((s) => {
      try {
        return fn(s);
      } catch {
        return s;
      }
    });

  return (
    <Table
      view={viewFor(state, ME)}
      onPlay={(card) => guard((s) => (s.turn === ME ? playCard(s, ME, card) : s))}
      onChooseTrump={(suit) => guard((s) => (s.hakem === ME ? chooseTrump(s, suit) : s))}
      onDiscard={(cards) => guard((s) => discardCards(s, ME, cards))}
      onDraw={(keep) => guard((s) => drawDecision(s, ME, keep))}
      onNextHand={() => guard((s) => (s.phase === "handEnd" ? startHand(s) : s))}
      onRestart={() => guard((s) => startHand({ ...resetGame(s), hakem: pickFirstHakem(players) }))}
      onLeave={() => router.push(`/${locale}`)}
      canAdvance
    />
  );
}
