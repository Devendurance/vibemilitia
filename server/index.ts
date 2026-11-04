import { LobbyRoom, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Request, Response } from "express";
import { FFARoom } from "./FFARoom";
import { FFA_ROOM, LOBBY_ROOM } from "../src/game/multiplayer/protocol";

const port = Number(process.env.PORT ?? 2567);
const transport = new WebSocketTransport();
const app = transport.getExpressApp();

app.get("/health", (_request: Request, response: Response) => {
  response.json({ ok: true, service: "vibe-militia-server", mode: FFA_ROOM });
});

const server = new Server({ transport });
server.define(LOBBY_ROOM, LobbyRoom);
server.define(FFA_ROOM, FFARoom);

async function main(): Promise<void> {
  await server.listen(port);
  console.log(`Vibe Militia server listening on port ${port}`);
}

void main();
