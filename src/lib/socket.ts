"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@/server/protocol";

export type AppSocket = Socket<ServerToClient, ClientToServer>;

let socket: AppSocket | null = null;

/** One shared socket per tab, connected lazily to the same origin. */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ["websocket", "polling"] });
  }
  return socket;
}
