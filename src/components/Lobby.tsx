"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayerCount } from "@/game/engine";
import { useI18n } from "@/i18n/context";
import type { Locale } from "@/i18n/dictionaries";
import { getSocket } from "@/lib/socket";
import { getPlayerId } from "@/lib/storage";
import { preloadCards } from "@/lib/preloadCards";
import { useInstallable, useStoredString } from "@/lib/useStored";
import { Frieze, Rosette, Star8, WingedDisc } from "./Ornament";

type Mode = "bots" | "online";

export function Lobby() {
  const { t, locale, n: num } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("bots");
  const [name, setName] = useStoredString("playerName");
  const [players, setPlayers] = useState<PlayerCount>(4);
  const [target, setTarget] = useState(7);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const installable = useInstallable();

  // Fetch all card artwork while the player is still in the lobby.
  useEffect(() => {
    preloadCards();
  }, []);

  const displayName = name.trim() || t.guest;
  const persistName = () => setName(name.trim());

  const startBots = () => {
    persistName();
    router.push(`/${locale}/play?players=${players}&target=${target}`);
  };

  const createRoom = () => {
    persistName();
    setBusy(true);
    setError(null);
    getSocket().emit(
      "room:create",
      { playerId: getPlayerId(), name: displayName, config: { players, targetScore: target } },
      (res) => {
        setBusy(false);
        if (res.ok) router.push(`/${locale}/room/${res.room.code}`);
        else setError(t[res.error as keyof typeof t] as string);
      },
    );
  };

  const joinRoom = () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    persistName();
    router.push(`/${locale}/room/${c}`);
  };

  const otherLocale: Locale = locale === "fa" ? "en" : "fa";
  const switchLocale = () => {
    document.cookie = `locale=${otherLocale}; path=/; max-age=31536000; samesite=lax`;
  };

  const install = async () => {
    const p = window.__installPrompt;
    if (!p) return;
    await p.prompt();
    await p.userChoice;
    window.__installPrompt = null;
    window.dispatchEvent(new Event("pwa:installed"));
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
      <header className="flex flex-col items-center text-center gap-2">
        <WingedDisc width={240} className="drop-shadow-[0_6px_14px_rgba(212,166,56,0.35)]" />
        <div className="flex items-center gap-4">
          <Rosette size={34} className="opacity-80 hidden sm:block" />
          <h1 className="text-6xl font-black gold-text title-glow leading-tight py-1">{t.appName}</h1>
          <Rosette size={34} className="opacity-80 hidden sm:block" />
        </div>
        <p className="text-sand">{t.tagline}</p>
      </header>

      <section className="panel panel-ornate w-full max-w-md p-6 flex flex-col gap-4">
        <Frieze className="-mt-1 mb-1" />

        <div className="grid grid-cols-2 gap-2">
          {(["bots", "online"] as Mode[]).map((m) => (
            <button key={m} className={`seg ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
              {m === "bots" ? t.playVsBots : t.playOnline}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-sand">{t.yourName}</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.you}
            maxLength={16}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <fieldset className="flex flex-col gap-1 text-sm">
            <span className="text-sand">{t.playerCount}</span>
            <div className="grid grid-cols-3 gap-1">
              {([2, 3, 4] as PlayerCount[]).map((p) => (
                <button key={p} className={`seg ${players === p ? "on" : ""}`} onClick={() => setPlayers(p)}>
                  {num(p)}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1 text-sm">
            <span className="text-sand">{t.targetScore}</span>
            <div className="grid grid-cols-3 gap-1">
              {[3, 5, 7].map((s) => (
                <button key={s} className={`seg ${target === s ? "on" : ""}`} onClick={() => setTarget(s)}>
                  {num(s)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="flex gap-2 text-xs text-sand leading-relaxed">
          <Star8 size={14} className="mt-0.5 flex-none" />
          <span>{t.rulesText[players]}</span>
        </p>

        {mode === "bots" ? (
          <button className="btn btn-primary text-lg py-3" onClick={startBots}>
            {t.start}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <button className="btn btn-primary text-lg py-3" onClick={createRoom} disabled={busy}>
              {busy ? t.connecting : t.createRoom}
            </button>
            <div className="flex gap-2">
              <input
                className="input uppercase tracking-[0.35em] text-center font-mono"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.roomCode}
                maxLength={5}
              />
              <button className="btn btn-ghost" onClick={joinRoom} disabled={!code.trim()}>
                {t.join}
              </button>
            </div>
            {error && <p className="text-sm text-brick">{error}</p>}
          </div>
        )}

        <Frieze className="rotate-180 -mb-1 mt-1" />
      </section>

      <div className="flex gap-3 text-sm">
        <Link href={`/${otherLocale}`} onClick={switchLocale} className="btn btn-ghost !py-1.5">
          {otherLocale === "fa" ? "فارسی" : "English"}
        </Link>
        {installable && (
          <button className="btn btn-ghost !py-1.5" onClick={install}>
            {t.installApp}
          </button>
        )}
      </div>
    </div>
  );
}
