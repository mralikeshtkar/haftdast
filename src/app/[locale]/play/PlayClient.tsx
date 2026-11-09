"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { PlayerCount } from "@/game/engine";
import { useI18n } from "@/i18n/context";
import { useStoredString } from "@/lib/useStored";

// The local game shuffles at mount, so it must not be server-rendered (hydration would mismatch).
const LocalGame = dynamic(() => import("@/components/LocalGame").then((m) => m.LocalGame), {
  ssr: false,
});

export function PlayClient() {
  const params = useSearchParams();
  const { t } = useI18n();
  const [stored] = useStoredString("playerName");
  const name = stored || t.you;

  const players = Math.min(4, Math.max(2, Number(params.get("players") ?? 4))) as PlayerCount;
  const target = Math.max(1, Number(params.get("target") ?? 7));

  // Key forces a fresh game when the settings change; the name is read once at mount.
  return <LocalGame key={`${players}-${target}`} players={players} targetScore={target} name={name} />;
}
