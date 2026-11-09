// In-memory room manager used by server.ts. The server is authoritative: clients only
// receive redacted PlayerViews, so nobody can peek at hidden cards.

import type { Server, Socket } from "socket.io";
import type { CardId, Suit } from "../game/cards";
import { botChooseCard, botChooseDiscards, botChooseTrump, botDrawKeep } from "../game/bot";
import {
  type GameConfig,
  type GameState,
  type Player,
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
} from "../game/engine";
import type { ClientToServer, RoomError, RoomInfo, ServerToClient } from "./protocol";

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

interface Seat {
  playerId: string | null;
  name: string | null;
  isBot: boolean;
  socketId: string | null;
}

interface Room {
  code: string;
  config: GameConfig;
  hostId: string;
  seats: Seat[];
  state: GameState | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const ROOM_TTL_MS = 10 * 60 * 1000; // delete a room 10 minutes after its last human leaves
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export class RoomManager {
  private rooms = new Map<string, Room>();
  constructor(private io: IO) {}

  attach(socket: Sock) {
    socket.on("room:create", ({ playerId, name, config }, ack) => {
      const players = [2, 3, 4].includes(config.players) ? config.players : 4;
      const targetScore = Math.min(21, Math.max(1, Math.floor(config.targetScore) || 7));
      const room: Room = {
        code: this.newCode(),
        config: { players, targetScore },
        hostId: playerId,
        seats: Array.from({ length: players }, () => ({
          playerId: null,
          name: null,
          isBot: false,
          socketId: null,
        })),
        state: null,
        botTimer: null,
        cleanupTimer: null,
      };
      room.seats[0] = { playerId, name: clean(name), isBot: false, socketId: socket.id };
      this.rooms.set(room.code, room);
      this.bind(socket, room, playerId);
      ack({ ok: true, room: this.info(room, playerId) });
    });

    socket.on("room:join", ({ playerId, name, code }, ack) => {
      const room = this.rooms.get(code.toUpperCase());
      if (!room) return ack({ ok: false, error: "roomNotFound" });

      let seat = room.seats.find((s) => s.playerId === playerId);
      if (!seat) {
        if (room.state) return ack({ ok: false, error: "gameStarted" });
        seat = room.seats.find((s) => !s.playerId && !s.isBot);
        if (!seat) return ack({ ok: false, error: "roomFull" });
        seat.playerId = playerId;
        seat.name = clean(name);
      }
      seat.socketId = socket.id;
      seat.isBot = false;
      this.bind(socket, room, playerId);
      ack({ ok: true, room: this.info(room, playerId) });
      this.broadcastRoom(room);
      if (room.state) this.sendState(room);
    });

    socket.on("room:start", ({ fillWithBots }) => {
      const room = this.roomOf(socket);
      if (!room || room.state) return;
      if (socket.data.playerId !== room.hostId) return socket.emit("room:error", "notHost");
      room.seats.forEach((s, i) => {
        if (!s.playerId) {
          if (!fillWithBots) return;
          s.isBot = true;
          s.name = `Bot ${i + 1}`;
        }
      });
      if (room.seats.some((s) => !s.playerId && !s.isBot)) return;

      const players: Player[] = room.seats.map((s, i) => ({
        id: s.playerId ?? `bot-${i}`,
        name: s.name ?? `Bot ${i + 1}`,
        seat: i,
        isBot: s.isBot,
      }));
      const game = createGame(room.config, players);
      room.state = startHand({ ...game, hakem: pickFirstHakem(room.config.players) });
      this.broadcastRoom(room);
      this.afterChange(room);
    });

    socket.on("game:chooseTrump", ({ suit }) => {
      const room = this.roomOf(socket);
      const seat = this.seatOf(socket, room);
      if (!room?.state || seat === null) return;
      if (room.state.phase !== "choosingTrump" || room.state.hakem !== seat) return;
      room.state = chooseTrump(room.state, suit as Suit);
      this.afterChange(room);
    });

    socket.on("game:discard", ({ cards }) => {
      const room = this.roomOf(socket);
      const seat = this.seatOf(socket, room);
      if (!room?.state || seat === null) return;
      try {
        room.state = discardCards(room.state, seat, (cards ?? []).map(String) as CardId[]);
      } catch {
        return socket.emit("room:error", "illegal");
      }
      this.afterChange(room);
    });

    socket.on("game:draw", ({ keep }) => {
      const room = this.roomOf(socket);
      const seat = this.seatOf(socket, room);
      if (!room?.state || seat === null) return;
      try {
        room.state = drawDecision(room.state, seat, !!keep);
      } catch {
        return socket.emit("room:error", "illegal");
      }
      this.afterChange(room);
    });

    socket.on("game:play", ({ card }) => {
      const room = this.roomOf(socket);
      const seat = this.seatOf(socket, room);
      if (!room?.state || seat === null) return;
      try {
        room.state = playCard(room.state, seat, card as CardId);
      } catch {
        return socket.emit("room:error", "illegal");
      }
      this.afterChange(room);
    });

    socket.on("game:nextHand", () => {
      const room = this.roomOf(socket);
      if (!room?.state || room.state.phase !== "handEnd") return;
      if (socket.data.playerId !== room.hostId) return;
      room.state = startHand(room.state);
      this.afterChange(room);
    });

    socket.on("game:restart", () => {
      const room = this.roomOf(socket);
      if (!room?.state || room.state.phase !== "gameEnd") return;
      if (socket.data.playerId !== room.hostId) return;
      room.state = startHand({
        ...resetGame(room.state),
        hakem: pickFirstHakem(room.config.players),
      });
      this.afterChange(room);
    });

    socket.on("room:lobby", () => {
      const room = this.roomOf(socket);
      if (!room?.state) return;
      if (socket.data.playerId !== room.hostId) return socket.emit("room:error", "notHost");
      if (room.state.phase !== "gameEnd" && room.state.phase !== "handEnd") return;
      if (room.botTimer) clearTimeout(room.botTimer);
      room.botTimer = null;
      room.state = null;
      // Bot seats become empty again so the host can decide anew when starting.
      for (const s of room.seats) {
        if (s.isBot) {
          s.isBot = false;
          s.name = null;
          s.playerId = null;
        }
      }
      this.broadcastRoom(room);
    });

    socket.on("room:leave", () => this.detach(socket, true));
    socket.on("disconnect", () => this.detach(socket, false));
  }

  // ---- helpers ----

  private bind(socket: Sock, room: Room, playerId: string) {
    socket.data.playerId = playerId;
    socket.data.code = room.code;
    socket.join(room.code);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  }

  private detach(socket: Sock, left: boolean) {
    const room = this.roomOf(socket);
    if (!room) return;
    const seat = room.seats.find((s) => s.socketId === socket.id);
    if (seat) {
      seat.socketId = null;
      if (left && !room.state) {
        // Leaving before the game starts frees the seat.
        seat.playerId = null;
        seat.name = null;
      }
    }
    socket.leave(room.code);
    socket.data.code = undefined;
    this.broadcastRoom(room);

    const humansOnline = room.seats.some((s) => s.playerId && s.socketId);
    if (!humansOnline && !room.cleanupTimer) {
      room.cleanupTimer = setTimeout(() => this.destroy(room), ROOM_TTL_MS);
    }
  }

  private destroy(room: Room) {
    if (room.botTimer) clearTimeout(room.botTimer);
    this.rooms.delete(room.code);
  }

  private roomOf(socket: Sock): Room | null {
    const code = socket.data.code as string | undefined;
    return code ? (this.rooms.get(code) ?? null) : null;
  }

  private seatOf(socket: Sock, room: Room | null): number | null {
    if (!room) return null;
    const i = room.seats.findIndex((s) => s.socketId === socket.id);
    return i >= 0 ? i : null;
  }

  private info(room: Room, playerId: string | null): RoomInfo {
    const mySeat = room.seats.findIndex((s) => s.playerId === playerId);
    return {
      code: room.code,
      config: room.config,
      started: room.state !== null,
      mySeat: mySeat >= 0 ? mySeat : null,
      seats: room.seats.map((s, seat) => ({
        seat,
        name: s.name,
        isBot: s.isBot,
        connected: s.isBot || s.socketId !== null,
        isHost: s.playerId === room.hostId,
      })),
    };
  }

  private broadcastRoom(room: Room) {
    for (const s of room.seats) {
      if (s.socketId) this.io.to(s.socketId).emit("room:update", this.info(room, s.playerId));
    }
  }

  private sendState(room: Room) {
    if (!room.state) return;
    room.seats.forEach((s, seat) => {
      if (s.socketId && room.state) this.io.to(s.socketId).emit("game:state", viewFor(room.state, seat));
    });
  }

  /** Push the new state to everyone and let bots take their turns. */
  private afterChange(room: Room) {
    this.sendState(room);
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
    const st = room.state;
    if (!st) return;

    const isBot = (seat: number) => room.seats[seat]?.isBot;

    if (st.phase === "choosingTrump" && isBot(st.hakem)) {
      room.botTimer = setTimeout(() => {
        if (!room.state || room.state.phase !== "choosingTrump") return;
        room.state = chooseTrump(room.state, botChooseTrump(room.state.hands[room.state.hakem]));
        this.afterChange(room);
      }, 900);
    } else if (st.phase === "discarding" && st.discardsNeeded.some((d, i) => d > 0 && isBot(i))) {
      const seat = st.discardsNeeded.findIndex((d, i) => d > 0 && isBot(i));
      room.botTimer = setTimeout(() => {
        const s = room.state;
        if (!s || s.phase !== "discarding" || s.discardsNeeded[seat] === 0) return;
        room.state = discardCards(
          s,
          seat,
          botChooseDiscards(s.hands[seat], s.trump as Suit, s.discardsNeeded[seat]),
        );
        this.afterChange(room);
      }, 900);
    } else if (st.phase === "drawing" && st.draw && isBot(st.draw.turn)) {
      room.botTimer = setTimeout(() => {
        const s = room.state;
        if (!s || s.phase !== "drawing" || !s.draw || !isBot(s.draw.turn)) return;
        const seat = s.draw.turn;
        room.state = drawDecision(
          s,
          seat,
          botDrawKeep(s.hands[seat], s.trump as Suit, offeredCard(s) as CardId),
        );
        this.afterChange(room);
      }, 650);
    } else if (st.phase === "playing" && isBot(st.turn)) {
      const afterTrick = st.currentTrick.length === 0 && st.lastTrick !== null;
      room.botTimer = setTimeout(
        () => {
          const s = room.state;
          if (!s || s.phase !== "playing" || !room.seats[s.turn].isBot) return;
          room.state = playCard(s, s.turn, botChooseCard(viewFor(s, s.turn)));
          this.afterChange(room);
        },
        afterTrick ? 1500 : 700,
      );
    } else if (st.phase === "handEnd" && room.seats.every((s) => s.isBot || !s.socketId)) {
      // Nobody human is around to press "next hand"; keep the game moving for a reconnect.
      room.botTimer = setTimeout(() => {
        if (room.state?.phase === "handEnd") {
          room.state = startHand(room.state);
          this.afterChange(room);
        }
      }, 5000);
    }
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}

function clean(name: string): string {
  const n = String(name ?? "").trim().slice(0, 16);
  return n || "Player";
}

export type { RoomError };
