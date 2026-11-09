// Socket.IO event contracts shared by the server and the client.

import type { CardId, Suit } from "@/game/cards";
import type { GameConfig, PlayerView } from "@/game/engine";

export interface RoomSeat {
  seat: number;
  name: string | null;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomInfo {
  code: string;
  config: GameConfig;
  seats: RoomSeat[];
  started: boolean;
  /** Seat of the receiving client, null for spectators. */
  mySeat: number | null;
}

export type RoomError = "roomNotFound" | "roomFull" | "gameStarted" | "notHost" | "illegal";

export interface ClientToServer {
  "room:create": (
    payload: { playerId: string; name: string; config: GameConfig },
    ack: (res: { ok: true; room: RoomInfo } | { ok: false; error: RoomError }) => void,
  ) => void;
  "room:join": (
    payload: { playerId: string; name: string; code: string },
    ack: (res: { ok: true; room: RoomInfo } | { ok: false; error: RoomError }) => void,
  ) => void;
  "room:start": (payload: { fillWithBots: boolean }) => void;
  "room:leave": () => void;
  "game:chooseTrump": (payload: { suit: Suit }) => void;
  "game:discard": (payload: { cards: CardId[] }) => void;
  "game:draw": (payload: { keep: boolean }) => void;
  "game:play": (payload: { card: CardId }) => void;
  "game:nextHand": () => void;
  "game:restart": () => void;
  /** Host: end the game and bring everyone back to the room lobby (between hands or after game end). */
  "room:lobby": () => void;
}

export interface ServerToClient {
  "room:update": (room: RoomInfo) => void;
  "game:state": (view: PlayerView) => void;
  "room:error": (error: RoomError) => void;
}
