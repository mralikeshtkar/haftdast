// Custom server: Next.js request handler + Socket.IO on the same port.
// dev:   npm run dev    (tsx server.ts, Turbopack)
// prod:  npm run build && npm start

import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { RoomManager } from "./src/server/rooms";
import type { ClientToServer, ServerToClient } from "./src/server/protocol";

const dev = process.env.NODE_ENV !== "production";
// Bind to all interfaces by default. (Not HOSTNAME: container platforms set it to the
// container id, and binding to that makes the platform's proxy return 502.)
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server<ClientToServer, ServerToClient>(server, {
    path: "/socket.io",
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 20000,
  });
  const rooms = new RoomManager(io);
  io.on("connection", (socket) => rooms.attach(socket));

  server.listen(port, hostname, () => {
    console.log(`> HaftDast ready on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  });
});
