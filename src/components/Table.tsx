"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type CardId, type Suit, SUITS, sortHand } from "@/game/cards";
import { AUTO_NEXT_HAND_SECONDS, type PlayerView, type TrickPlay, rulesFor, teamOf } from "@/game/engine";
import { useI18n } from "@/i18n/context";
import { Card, SUIT_SYMBOL, isRed } from "./Card";
import { Frieze, Rosette, Star8 } from "./Ornament";
import { preloadCards } from "@/lib/preloadCards";

export interface TableProps {
  view: PlayerView;
  onPlay: (card: CardId) => void;
  onChooseTrump: (suit: Suit) => void;
  onDiscard: (cards: CardId[]) => void;
  onDraw: (keep: boolean) => void;
  onNextHand: () => void;
  onRestart: () => void;
  onLeave: () => void;
  /** Whether this client may skip the between-hands countdown (host in online games). */
  canAdvance: boolean;
  /** Label of the game-over button, shown to everyone (e.g. "Back to room" online). Defaults to "Play again". */
  restartLabel?: string;
  banner?: string | null;
}

/** Position of each opponent relative to the viewer, as CSS classes. */
function seatPosition(rel: number, n: number): string {
  if (n === 2) return "top-2 left-1/2 -translate-x-1/2";
  if (n === 3) return rel === 1 ? "top-2 right-4" : "top-2 left-4";
  if (rel === 1) return "top-1/2 right-2 -translate-y-1/2";
  if (rel === 2) return "top-2 left-1/2 -translate-x-1/2";
  return "top-1/2 left-2 -translate-y-1/2";
}

/** Where a played card lands in the centre, relative to the viewer. */
function trickOffset(rel: number, n: number): { x: number; y: number } {
  if (rel === 0) return { x: 0, y: 36 };
  if (n === 2) return { x: 0, y: -36 };
  if (n === 3) return rel === 1 ? { x: 48, y: -28 } : { x: -48, y: -28 };
  if (rel === 1) return { x: 56, y: 0 };
  if (rel === 2) return { x: 0, y: -36 };
  return { x: -56, y: 0 };
}

function useViewportWidth() {
  const [w, setW] = useState(900);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return w;
}

export function Table(props: TableProps) {
  const {
    view,
    onPlay,
    onChooseTrump,
    onDiscard,
    onDraw,
    onNextHand,
    onRestart,
    onLeave,
    canAdvance,
    restartLabel,
    banner,
  } = props;
  const { t, f, n: num, dir } = useI18n();
  const n = view.config.players;
  const me = view.seat;
  const rules = rulesFor(n);
  const vw = useViewportWidth();
  useEffect(() => {
    preloadCards();
  }, []);

  // Keep the completed trick on the table for a moment before clearing it:
  // `holding` names the lastTrick currently being shown, and a timer releases it.
  const [holding, setHolding] = useState<PlayerView["lastTrick"]>(null);
  const [seenTrick, setSeenTrick] = useState<PlayerView["lastTrick"]>(view.lastTrick);
  if (view.lastTrick !== seenTrick) {
    // "Adjust state when a prop changes" pattern: a new trick just completed, so hold it.
    setSeenTrick(view.lastTrick);
    if (view.currentTrick.length === 0 && view.lastTrick) setHolding(view.lastTrick);
  }
  useEffect(() => {
    if (!holding) return;
    const id = setTimeout(() => setHolding(null), 1300);
    return () => clearTimeout(id);
  }, [holding]);
  const shownTrick: { plays: TrickPlay[]; winner: number | null } =
    view.currentTrick.length > 0
      ? { plays: view.currentTrick, winner: null }
      : holding
        ? { plays: holding.plays, winner: holding.winner }
        : { plays: [], winner: null };

  // Two-step play: first tap selects (raises) a card, second tap / Play button / drag plays it.
  const [selected, setSelected] = useState<CardId | null>(null);
  // Discard selection (2 players): several cards at once.
  const [discardSel, setDiscardSel] = useState<CardId[]>([]);
  const [turnKey, setTurnKey] = useState(`${view.turn}-${view.handNumber}-${view.phase}`);
  const currentTurnKey = `${view.turn}-${view.handNumber}-${view.phase}`;
  if (turnKey !== currentTurnKey) {
    setTurnKey(currentTurnKey);
    setSelected(null);
    setDiscardSel([]);
  }

  // After each of my draw decisions, the card I actually received glows in my hand for a moment.
  const drawKey = view.draw?.lastSeen ? `${view.draw.lastSeen.kept}-${view.draw.lastSeen.burned}` : null;
  const [seenDrawKey, setSeenDrawKey] = useState(drawKey);
  const [gotCard, setGotCard] = useState<CardId | null>(null);
  if (drawKey !== seenDrawKey) {
    setSeenDrawKey(drawKey);
    if (drawKey && view.draw?.lastSeen) setGotCard(view.draw.lastSeen.kept);
  }
  useEffect(() => {
    if (!gotCard) return;
    const id = setTimeout(() => setGotCard(null), 1300);
    return () => clearTimeout(id);
  }, [gotCard]);

  // Between hands: visible countdown to the automatic next deal.
  const [countdown, setCountdown] = useState(AUTO_NEXT_HAND_SECONDS);
  const [seenHandEnd, setSeenHandEnd] = useState<number | null>(null);
  const handEndKey = view.phase === "handEnd" ? view.handNumber : null;
  if (handEndKey !== seenHandEnd) {
    setSeenHandEnd(handEndKey);
    setCountdown(AUTO_NEXT_HAND_SECONDS);
  }
  useEffect(() => {
    if (view.phase !== "handEnd") return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [view.phase, view.handNumber]);

  const isMyTurn = view.phase === "playing" && view.turn === me;
  const discarding = view.phase === "discarding";
  const myDiscards = view.discardsNeeded?.[me] ?? 0;
  const drawing = view.phase === "drawing";
  const myDraw = drawing && view.draw?.turn === me;

  const tap = (card: CardId) => {
    if (discarding) {
      if (myDiscards === 0) return;
      setDiscardSel((sel) =>
        sel.includes(card) ? sel.filter((c) => c !== card) : sel.length < myDiscards ? [...sel, card] : sel,
      );
      return;
    }
    if (!view.legal.includes(card)) return;
    if (selected === card) {
      setSelected(null);
      onPlay(card);
    } else {
      setSelected(card);
    }
  };
  const play = (card: CardId) => {
    if (!view.legal.includes(card)) return;
    setSelected(null);
    onPlay(card);
  };

  const hand = useMemo(() => sortHand(view.hand, view.trump), [view.hand, view.trump]);
  // Phones: big hands go on two rows so each card stays large and easy to tap.
  const twoRows = vw < 640 && hand.length > 7;
  const rows: CardId[][] = twoRows
    ? [hand.slice(0, Math.ceil(hand.length / 2)), hand.slice(Math.ceil(hand.length / 2))]
    : [hand];
  const perRow = Math.max(...rows.map((r) => r.length), 1);
  // `visible` is the fraction of each card left uncovered by its neighbour; small hands spread out.
  const visible = perRow > 9 ? 0.58 : perRow > 6 ? 0.66 : vw < 640 ? 0.78 : 1;
  // On phones the hand gets the whole width (my own badge is hidden; my tricks show in the header).
  const showMyBadge = vw >= 640;
  const budget = vw - (showMyBadge ? 180 : 28);
  const cardW = Math.min(
    twoRows ? 96 : 84,
    Math.max(44, Math.floor(budget / (Math.max(perRow, 4) * visible + (1 - visible)))),
  );
  const cardH = cardW * 1.452;

  // Drop target: releasing a dragged card above the hand area plays it.
  const handRef = useRef<HTMLDivElement>(null);
  const isOverTable = (clientY: number) => {
    const top = handRef.current?.getBoundingClientRect().top ?? Infinity;
    return clientY < top - 24;
  };

  const nameOf = (seat: number) => view.players[seat]?.name ?? t.seatNames[seat];
  const teamLabel = (team: number) => {
    if (n === 4) return team === teamOf(me, n) ? t.us : t.them;
    return nameOf(team);
  };

  const opponents = Array.from({ length: n - 1 }, (_, i) => (me + i + 1) % n);
  const winnerTeam = view.scores.indexOf(Math.max(...view.scores));
  const otherSeat = n === 2 ? 1 - me : null;

  return (
    <div className="relative flex flex-col h-dvh w-full overflow-hidden" dir={dir}>
      {/* Top bar: scores and trump */}
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 text-sm">
        <button className="btn btn-ghost !py-1.5 !px-3 text-xs" onClick={onLeave}>
          {t.leave}
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {view.scores.map((score, team) => (
            <div key={team} className="panel px-3 py-1 flex items-center gap-2 !rounded-full">
              <span className="text-sand">{teamLabel(team)}</span>
              <span className="font-black text-gold-light text-base">{num(score)}</span>
              <span className="text-xs text-sand/70">
                {num(view.tricks[team])}/{num(rules.tricksToWin)}
              </span>
            </div>
          ))}
        </div>
        <div className="panel px-3 py-1 flex items-center gap-1 min-w-12 justify-center !rounded-full">
          {view.trump ? (
            <span
              className={`suit text-2xl leading-none ${isRed(view.trump) ? "text-brick" : "text-parchment"}`}
              title={t.suits[view.trump]}
            >
              {SUIT_SYMBOL[view.trump]}
            </span>
          ) : (
            <span className="text-sand text-xs">{t.trump}</span>
          )}
        </div>
      </header>
      <Frieze className="opacity-50" />

      {banner && <div className="mx-auto mt-1 panel px-4 py-1.5 text-sm text-gold-light pop">{banner}</div>}

      {/* Table area */}
      <main className="relative flex-1 min-h-0">
        {/* table medallion */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.12]">
          <Rosette size={Math.min(vw * 0.7, 420)} />
        </div>

        {opponents.map((seat, i) => (
          <Opponent key={seat} seat={seat} view={view} className={seatPosition(i + 1, n)} name={nameOf(seat)} />
        ))}

        {/* Trick */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {shownTrick.plays.map((p) => {
            const rel = (p.seat - me + n) % n;
            const off = trickOffset(rel, n);
            const won = shownTrick.winner === p.seat;
            return (
              <div
                key={p.card}
                className="absolute pop"
                style={{
                  transform: `translate(calc(-50% + ${dir === "rtl" ? -off.x : off.x}px), calc(-50% + ${off.y}px)) ${won ? "scale(1.12)" : ""}`,
                  zIndex: won ? 5 : 1,
                  transition: "transform 250ms ease",
                  filter: won ? "drop-shadow(0 0 14px rgba(212,166,56,0.8))" : undefined,
                }}
              >
                <Card card={p.card} width={Math.min(68, cardW)} />
              </div>
            );
          })}
        </div>

        {/* 2 players: discard panel */}
        {discarding && (
          <CenterPanel>
            {myDiscards > 0 ? (
              <>
                <h2 className="text-lg font-black text-gold-light">
                  {f(t.discardTitle, { n: num(myDiscards) })}
                </h2>
                <button
                  className="btn btn-primary mt-2 !px-8"
                  disabled={discardSel.length !== myDiscards}
                  onClick={() => {
                    const cards = discardSel;
                    setDiscardSel([]);
                    onDiscard(cards);
                  }}
                >
                  {t.discardConfirm} ({num(discardSel.length)}/{num(myDiscards)})
                </button>
              </>
            ) : (
              <p className="text-sand">
                {f(t.waitingDiscard, { name: otherSeat !== null ? nameOf(otherSeat) : "" })}
              </p>
            )}
          </CenterPanel>
        )}

        {/* 2 players: draw panel */}
        {drawing && view.draw && (
          <CenterPanel>
            <div className="flex items-center justify-center gap-5" dir="ltr">
              <div className="flex flex-col items-center gap-1">
                <div className="relative" style={{ width: 64, height: 64 * 1.452 + 8 }}>
                  <Card width={64} className="absolute top-2 left-0 !shadow-none" />
                  <Card width={64} className="absolute top-1 left-0 !shadow-none" />
                  <Card width={64} className="absolute top-0 left-0" />
                </div>
                <span className="text-xs text-sand">
                  {t.stock}: <b className="text-gold-light">{num(view.draw.stock)}</b>
                </span>
              </div>
              {myDraw && view.draw.offered && (
                <div className="pop">
                  <Card card={view.draw.offered} width={80} />
                </div>
              )}
            </div>
            {myDraw && view.draw.offered ? (
              <>
                <div className="grid grid-cols-2 gap-2 w-full mt-2">
                  <button className="btn btn-primary text-base !py-3" onClick={() => onDraw(true)}>
                    {t.drawKeep}
                  </button>
                  <button className="btn btn-ghost text-base !py-3" onClick={() => onDraw(false)}>
                    {t.drawBurn}
                  </button>
                </div>
                <p className="text-[11px] text-sand/70">{t.drawHint}</p>
              </>
            ) : (
              <p className="text-sand mt-2">{f(t.waitingDraw, { name: nameOf(view.draw.turn) })}</p>
            )}
          </CenterPanel>
        )}

        {/* Turn hint / play button */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-sand whitespace-nowrap flex flex-col items-center gap-1">
          {view.phase === "playing" &&
            (isMyTurn ? (
              selected ? (
                <button
                  className="btn btn-primary !py-2.5 !px-10 text-base pop"
                  onClick={() => play(selected)}
                >
                  {t.playCard}
                </button>
              ) : (
                <span className="text-gold-light font-bold">{t.yourTurn}</span>
              )
            ) : (
              f(t.turnOf, { name: nameOf(view.turn) })
            ))}
          {(discarding || drawing) && (
            <span className="text-[11px] text-sand/70">{f(t.cardsInHand, { n: num(hand.length) })}</span>
          )}
        </div>
      </main>

      {/* My area */}
      <footer className="relative pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        {showMyBadge && (
          <div className="absolute bottom-3 end-4 z-20">
            <SeatBadge seat={me} view={view} name={t.you} />
          </div>
        )}
        <div className="flex items-end justify-center px-3">
          <div
            ref={handRef}
            className="flex flex-col items-center pt-14"
            dir="ltr"
            style={{ minHeight: cardH + 14 }}
          >
            {rows.map((row, r) => (
              <div
                key={r}
                className="flex justify-center"
                style={{ marginTop: r === 0 ? 0 : -cardH * 0.48, zIndex: r + 1, position: "relative" }}
              >
                {row.map((card, i) => {
                  const selectable = discarding ? myDiscards > 0 : view.legal.includes(card);
                  const isSel = discarding ? discardSel.includes(card) : selected === card;
                  // Gentle fan: rotate around a pivot below the hand, outer cards sit lower.
                  const mid = (row.length - 1) / 2;
                  const spread = twoRows ? 0 : Math.min(4, 36 / Math.max(row.length, 1));
                  const angle = (i - mid) * spread;
                  return (
                    <HandCard
                      key={card}
                      card={card}
                      width={cardW}
                      angle={angle}
                      marginLeft={i === 0 ? 0 : visible >= 1 ? 6 : -cardW * (1 - visible)}
                      legal={selectable}
                      selected={isSel}
                      multi={discarding}
                      fresh={card === gotCard}
                      dim={(isMyTurn && !selectable) || (discarding && myDiscards === 0)}
                      draggable={!discarding && selectable}
                      onTap={() => tap(card)}
                      onDrop={(clientY) => (isOverTable(clientY) ? play(card) : undefined)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* Overlays */}
      {view.phase === "choosingTrump" && (
        <Overlay>
          {view.hakem === me ? (
            <>
              <h2 className="text-xl font-black text-gold-light mb-3">{t.chooseTrump}</h2>
              <div className="flex gap-1 justify-center mb-4" dir="ltr">
                {sortHand(view.hand, null).map((c) => (
                  <Card key={c} card={c} width={54} />
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SUITS.map((s) => (
                  <button
                    key={s}
                    className="btn flex-col !py-3 bg-parchment text-ink hover:brightness-95 border border-gold"
                    onClick={() => onChooseTrump(s)}
                  >
                    <span className={`suit text-3xl leading-none ${isRed(s) ? "text-brick" : ""}`}>
                      {SUIT_SYMBOL[s]}
                    </span>
                    <span className="text-xs">{t.suits[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-lg">{f(t.hakemChoosing, { name: nameOf(view.hakem) })}</p>
          )}
        </Overlay>
      )}

      {/* Between hands: result + short countdown to the next deal */}
      {view.phase === "handEnd" && view.lastHand && (
        <Overlay>
          <Rosette size={40} className="mx-auto mb-2 opacity-90" />
          {view.lastHand.kind === "draw" ? (
            <h2 className="text-xl font-black mb-2">{t.hand} —</h2>
          ) : (
            <h2 className="text-xl font-black mb-2">
              {n === 4
                ? f(t.teamWon, { name: teamLabel(view.lastHand.winnerTeam) })
                : f(t.handWon, { name: nameOf(view.lastHand.winnerTeam) })}
            </h2>
          )}
          {view.lastHand.kind === "kot" && <p className="gold-text text-3xl font-black mb-1">{t.kot}</p>}
          {view.lastHand.kind === "hakemKot" && (
            <p className="gold-text text-3xl font-black mb-1">{t.hakemKot}</p>
          )}
          <p className="text-sand mb-1">
            {view.lastHand.tricks.map((tr, i) => `${teamLabel(i)}: ${num(tr)}`).join(" · ")}
          </p>
          <div className="flex gap-3 justify-center text-sm mb-4 mt-2">
            {view.scores.map((s, i) => (
              <span key={i} className="panel !rounded-full px-3 py-1">
                {teamLabel(i)} <b className="text-gold-light">{num(s)}</b>
              </span>
            ))}
          </div>
          <p className="text-sand text-sm">{f(t.nextHandIn, { n: num(countdown) })}</p>
          {canAdvance && (
            <button className="btn btn-ghost mt-2 !py-1.5 text-sm" onClick={onNextHand}>
              {t.nextHand}
            </button>
          )}
        </Overlay>
      )}

      {/* Game over: winner modal, stays until someone chooses to go back */}
      {view.phase === "gameEnd" && (
        <Overlay>
          <Rosette size={56} className="mx-auto mb-2" />
          <p className="text-sand text-sm">{t.champion}</p>
          <h2 className="gold-text text-4xl font-black my-2 leading-tight">{teamLabel(winnerTeam)}</h2>
          <div className="flex gap-3 justify-center text-sm my-4">
            {view.scores.map((s, i) => (
              <span key={i} className="panel !rounded-full px-3 py-1">
                {teamLabel(i)} <b className="text-gold-light">{num(s)}</b>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary text-lg" onClick={onRestart}>
              {restartLabel ?? t.playAgain}
            </button>
            <button className="btn btn-ghost" onClick={onLeave}>
              {t.leave}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/**
 * A card in the player's hand: tap to select/play, or drag it up onto the table to play.
 * Pointer events (not click) so one gesture model covers mouse and touch.
 */
function HandCard({
  card,
  width,
  angle,
  marginLeft,
  legal,
  selected,
  multi,
  fresh,
  dim,
  draggable,
  onTap,
  onDrop,
}: {
  card: CardId;
  width: number;
  angle: number;
  marginLeft: number;
  legal: boolean;
  selected: boolean;
  /** Multi-select mode (discarding): picked cards just lift, they don't grow or cover neighbours. */
  multi: boolean;
  /** Just arrived in the hand (draw phase): glows for a moment. */
  fresh: boolean;
  dim: boolean;
  draggable: boolean;
  onTap: () => void;
  onDrop: (clientY: number) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!legal) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || !draggable) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) > 8) s.moved = true;
    if (s.moved) setDrag({ dx, dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s) return;
    if (s.moved) onDrop(e.clientY);
    else onTap();
  };
  const onPointerCancel = () => {
    start.current = null;
    setDrag(null);
  };

  const restTransform = selected && !multi ? "rotate(0deg)" : `rotate(${angle}deg)`;
  return (
    <div
      className={`hand-card relative ${selected && !multi ? "selected" : ""}`}
      style={{
        marginLeft,
        touchAction: "none",
        zIndex: drag ? 50 : selected && !multi ? 10 : undefined,
        transform: drag
          ? `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 30}deg)`
          : restTransform,
        transition: drag ? "none" : "transform 180ms ease",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Card
        card={card}
        width={width}
        legal={legal}
        selected={selected && !drag && !multi}
        picked={selected && multi}
        dim={dim}
        className={fresh ? "fresh" : ""}
      />
    </div>
  );
}

function CenterPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[min(92vw,22rem)]">
      <div className="panel panel-ornate pop px-5 py-4 text-center flex flex-col items-center gap-1">{children}</div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-lapis-dark/60 p-4">
      <div className="panel panel-ornate pop px-6 py-5 text-center max-w-sm w-full">{children}</div>
    </div>
  );
}

function SeatBadge({ seat, view, name }: { seat: number; view: PlayerView; name: string }) {
  const { t, n: num } = useI18n();
  const won = view.tricks[teamOf(seat, view.config.players)] ?? 0;
  const isTurn =
    (view.phase === "playing" && view.turn === seat) ||
    (view.phase === "drawing" && view.draw?.turn === seat) ||
    (view.phase === "discarding" && (view.discardsNeeded?.[seat] ?? 0) > 0);
  const isHakem = view.hakem === seat && view.phase !== "lobby";
  return (
    <div className="flex flex-col items-center text-xs min-w-14">
      <div className={`avatar w-11 h-11 text-base ${isTurn ? "turn turn-ring" : ""}`}>
        {name.slice(0, 1).toUpperCase()}
        {isHakem && (
          <span className="absolute -top-2 -right-2" title={t.hakem}>
            <Star8 size={18} />
          </span>
        )}
      </div>
      <div className="text-center leading-tight mt-1 flex flex-col items-center gap-0.5">
        <div className="font-bold truncate max-w-20">{name}</div>
        {view.phase !== "lobby" && (
          <span
            className="min-w-6 px-1.5 rounded-full bg-black/35 border border-gold/40 text-gold-light font-black text-[11px] leading-5"
            title={t.wonTricks}
          >
            {num(won)}
          </span>
        )}
      </div>
    </div>
  );
}

function Opponent({
  seat,
  view,
  className,
  name,
}: {
  seat: number;
  view: PlayerView;
  className: string;
  name: string;
}) {
  const count = view.handCounts[seat] ?? 0;
  return (
    <div className={`absolute ${className} flex flex-col items-center gap-1`}>
      <SeatBadge seat={seat} view={view} name={name} />
      <div className="flex" dir="ltr">
        {Array.from({ length: Math.min(count, 17) }, (_, i) => (
          <Card key={i} width={24} className="!shadow-none" style={{ marginLeft: i ? -15 : 0 }} />
        ))}
      </div>
    </div>
  );
}
