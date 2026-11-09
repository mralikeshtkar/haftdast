// End-to-end smoke test for the Socket.IO server: two clients create/join a room,
// start with bots, and play legal cards until a hand ends.
// Usage: npx tsx scripts/online-smoke.ts [http://localhost:3000]

import { io, type Socket } from "socket.io-client";
import type { ClientToServer, RoomInfo, ServerToClient } from "../src/server/protocol";
import type { PlayerView } from "../src/game/engine";

const url = process.argv[2] ?? "http://localhost:3000";
const playerCount = (Number(process.argv[3]) || 4) as 2 | 3 | 4;
type C = Socket<ServerToClient, ClientToServer>;

function connect(): Promise<C> {
  return new Promise((resolve, reject) => {
    const s: C = io(url, { transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}

async function main() {
  const host = await connect();
  const guest = await connect();
  const views = new Map<string, PlayerView>();
  const handEnded = new Promise<PlayerView>((resolve) => {
    const onState = (who: string) => (v: PlayerView) => {
      views.set(who, v);
      if (v.phase === "handEnd" || v.phase === "gameEnd") resolve(v);
    };
    host.on("game:state", onState("host"));
    guest.on("game:state", onState("guest"));
  });

  const room = await new Promise<RoomInfo>((resolve, reject) =>
    host.emit(
      "room:create",
      { playerId: "smoke-host", name: "Host", config: { players: playerCount, targetScore: 7 } },
      (res) => (res.ok ? resolve(res.room) : reject(new Error(res.error))),
    ),
  );
  console.log("room", room.code, "host seat", room.mySeat);

  const joined = await new Promise<RoomInfo>((resolve, reject) =>
    guest.emit("room:join", { playerId: "smoke-guest", name: "Guest", code: room.code }, (res) =>
      res.ok ? resolve(res.room) : reject(new Error(res.error)),
    ),
  );
  console.log("guest seat", joined.mySeat, "seats", joined.seats.map((s) => s.name));

  host.emit("room:start", { fillWithBots: true });

  // Humans act whenever their view says it's their turn.
  let moves = 0;
  const act = (who: string, sock: C) => (v: PlayerView) => {
    if (v.phase === "choosingTrump" && v.hakem === v.seat) {
      sock.emit("game:chooseTrump", { suit: "H" });
      console.log(who, "chose trump");
    } else if (v.phase === "discarding" && v.discardsNeeded[v.seat] > 0) {
      sock.emit("game:discard", { cards: v.hand.slice(0, v.discardsNeeded[v.seat]) });
    } else if (v.phase === "drawing" && v.draw?.offered) {
      sock.emit("game:draw", { keep: v.draw.offered[0] === "H" });
    } else if (v.phase === "playing" && v.turn === v.seat && v.legal.length) {
      sock.emit("game:play", { card: v.legal[0] });
      moves++;
    }
  };
  host.on("game:state", act("host", host));
  guest.on("game:state", act("guest", guest));

  const final = await Promise.race([
    handEnded,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60000)),
  ]);
  console.log("hand ended:", final.lastHand, "human moves:", moves, "scores:", final.scores);

  // Hidden information check: a view must never contain other players' cards.
  const hv = views.get("host")!;
  if (hv.handCounts.length !== playerCount || "hands" in hv || "deck" in hv) {
    throw new Error("view leaks state");
  }
  // The burned stock card must never reach a client, in any shape.
  for (const v of views.values()) {
    if (JSON.stringify(v).includes("burned")) throw new Error("view leaks the burned card");
  }

  // Host sends everyone back to the room lobby between hands.
  const backInLobby = new Promise<RoomInfo>((resolve) =>
    guest.on("room:update", (r) => {
      if (!r.started) resolve(r);
    }),
  );
  host.emit("room:lobby");
  const lobby = await Promise.race([
    backInLobby,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("lobby timeout")), 5000)),
  ]);
  if (lobby.seats.some((s) => s.isBot)) throw new Error("bot seats should be cleared");
  console.log("back in lobby, seats:", lobby.seats.map((s) => s.name));

  host.disconnect();
  guest.disconnect();
  console.log("online smoke OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
