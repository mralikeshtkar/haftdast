"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerView } from "@/game/engine";
import { useI18n } from "@/i18n/context";
import { getSocket } from "@/lib/socket";
import { getPlayerId } from "@/lib/storage";
import { useStoredString } from "@/lib/useStored";
import type { RoomError, RoomInfo } from "@/server/protocol";
import { Table } from "./Table";

export function OnlineGame({ code }: { code: string }) {
  const { t, f, locale, n: num } = useI18n();
  const router = useRouter();
  const [storedName, setStoredName] = useStoredString("playerName");
  const [draft, setDraft] = useState("");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const [connected, setConnected] = useState(false);
  const [fillWithBots, setFillWithBots] = useState(true);
  const [copied, setCopied] = useState(false);

  const name = storedName.trim();
  const ready = name.length > 0;

  // Join (and re-join after reconnects) once we know the player's name.
  useEffect(() => {
    if (!ready) return;
    const socket = getSocket();
    const join = () => {
      setConnected(true);
      socket.emit("room:join", { playerId: getPlayerId(), name, code }, (res) => {
        if (res.ok) setRoom(res.room);
        else setError(res.error);
      });
    };
    const onDisconnect = () => setConnected(false);
    const onRoom = (r: RoomInfo) => {
      setRoom(r);
      if (!r.started) setView(null); // back in the lobby: drop the finished game's view
    };
    const onState = (v: PlayerView) => setView(v);
    const onError = (e: RoomError) => setError(e);

    socket.on("connect", join);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onRoom);
    socket.on("game:state", onState);
    socket.on("room:error", onError);
    if (socket.connected) join();

    return () => {
      socket.off("connect", join);
      socket.off("disconnect", onDisconnect);
      socket.off("room:update", onRoom);
      socket.off("game:state", onState);
      socket.off("room:error", onError);
    };
  }, [code, name, ready]);

  const leave = () => {
    getSocket().emit("room:leave");
    router.push(`/${locale}`);
  };

  if (!ready) {
    return (
      <Centered>
        <form
          className="panel panel-ornate w-full max-w-sm p-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setStoredName(draft.trim());
          }}
        >
          <h1 className="text-xl font-black text-gold-light text-center">{t.enterName}</h1>
          <p className="text-xs text-sand text-center">
            {t.room}: <span className="font-mono tracking-widest" dir="ltr">{code}</span>
          </p>
          <input
            className="input text-center text-lg"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.yourName}
            maxLength={16}
            autoFocus
          />
          <button className="btn btn-primary text-lg" type="submit" disabled={!draft.trim()}>
            {t.continueBtn}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => router.push(`/${locale}`)}>
            {t.back}
          </button>
        </form>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <p className="text-lg mb-4">{t[error as keyof typeof t] as string}</p>
        <button className="btn btn-primary" onClick={leave}>
          {t.back}
        </button>
      </Centered>
    );
  }

  if (!room) {
    return (
      <Centered>
        <p className="text-sand">{t.connecting}</p>
      </Centered>
    );
  }

  const isHost = room.mySeat !== null && room.seats[room.mySeat]?.isHost;

  if (room.started && view) {
    const socket = getSocket();
    return (
      <Table
        view={view}
        onPlay={(card) => socket.emit("game:play", { card })}
        onChooseTrump={(suit) => socket.emit("game:chooseTrump", { suit })}
        onDiscard={(cards) => socket.emit("game:discard", { cards })}
        onDraw={(keep) => socket.emit("game:draw", { keep })}
        onNextHand={() => socket.emit("game:nextHand")}
        onRestart={() => socket.emit("room:lobby")}
        restartLabel={t.backToRoom}
        onLeave={leave}
        canAdvance={!!isHost}
        banner={connected ? null : t.disconnected}
      />
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const humans = room.seats.filter((s) => s.name && !s.isBot).length;
  const canStart = isHost && (fillWithBots || room.seats.every((s) => s.name));

  return (
    <Centered>
      <div className="panel w-full max-w-md p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t.room}</h1>
          <button className="btn btn-ghost !py-1 font-mono tracking-[0.3em] text-lg" dir="ltr" onClick={copy}>
            {room.code}
            <span className="text-xs tracking-normal text-muted">{copied ? t.copied : t.copyCode}</span>
          </button>
        </div>
        <p className="text-sm text-muted">
          {num(room.config.players)} {t.players} · {t.targetScore}: {num(room.config.targetScore)}
        </p>

        <ul className="flex flex-col gap-2">
          {room.seats.map((s) => (
            <li key={s.seat} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
              <span
                className={`w-8 h-8 rounded-full grid place-items-center font-bold ${
                  s.name ? "bg-gold text-ink" : "bg-white/10 text-muted"
                }`}
              >
                {s.name ? s.name.slice(0, 1).toUpperCase() : num(s.seat + 1)}
              </span>
              <span className="flex-1">
                {s.name ?? <span className="text-muted">{fillWithBots ? t.bot : t.emptySeat}</span>}
                {s.seat === room.mySeat && <span className="text-muted text-xs"> ({t.you})</span>}
              </span>
              {s.isHost && <span className="text-xs text-gold">{t.host}</span>}
              {s.name && !s.connected && <span className="text-xs text-red-300">⚠</span>}
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fillWithBots}
                onChange={(e) => setFillWithBots(e.target.checked)}
                className="accent-gold w-4 h-4"
              />
              {t.fillWithBots}
            </label>
            <button
              className="btn btn-primary text-lg"
              disabled={!canStart || !connected}
              onClick={() => getSocket().emit("room:start", { fillWithBots })}
            >
              {t.startGame}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted text-center">
            {humans < room.config.players ? t.waitingForPlayers : t.onlyHostCanStart}
          </p>
        )}
        {!connected && <p className="text-sm text-red-300 text-center">{t.disconnected}</p>}
        <button className="btn btn-ghost" onClick={leave}>
          {t.leave}
        </button>
        <p className="text-xs text-muted">{f(t.rulesText[room.config.players], {})}</p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex items-center justify-center p-4">{children}</div>;
}
