import { WebSocketServer, WebSocket, type RawData } from "ws";
import { type IncomingMessage } from "http";
import { verifyToken } from "./auth";
import { db } from "@workspace/db";
import { chatMessagesTable, playerPositionsTable, avatarsTable, playersTable, roomsTable } from "@workspace/db";
import { count, desc, eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  broadcastToRoom,
  generateDoorPosition,
  roomManager,
  validateRoomShape,
  validateRoomWalls,
  type Room,
  type RoomPlayer,
} from "./room-manager";

interface GameClient {
  ws: WebSocket;
  playerId: number;
  username: string;
  posX: number;
  posY: number;
  avatar?: AvatarSnapshot;
  positionWrite: Promise<void>;
}

interface AvatarSnapshot {
  id: number;
  playerId: number;
  skinColor: string;
  hairColor: string;
  hairStyle: string;
  shirtColor: string;
  pantsColor: string;
  hatStyle: string | null;
  accessory: string | null;
}

const clients = new Map<number, GameClient>();
const MAX_ROOMS_PER_PLAYER = 10;

function safeSend(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data: unknown, excludePlayerId?: number): void {
  for (const [playerId, client] of clients) {
    if (excludePlayerId !== undefined && playerId === excludePlayerId) continue;
    safeSend(client.ws, data);
  }
}

function roomMessage(type: string, data: unknown): { type: string; data: unknown } {
  return { type, data };
}

function sendRoomError(ws: WebSocket, code: string, message: string): void {
  safeSend(ws, roomMessage("room:error", { code, message }));
}

function roomPlayer(client: GameClient): RoomPlayer {
  return {
    id: client.playerId,
    username: client.username,
    posX: client.posX,
    posY: client.posY,
  };
}

type RoomPayload = {
  name?: unknown;
  roomId?: unknown;
  tiles?: unknown;
  walls?: unknown;
  floorTextureId?: unknown;
  wallTextureId?: unknown;
  isPublic?: unknown;
  password?: unknown;
};

function validateRoomPayload(
  data: RoomPayload | undefined,
  existingPassword: string | null = null,
):
  | {
      ok: true;
      name: string;
      tiles: Room["tiles"];
      walls: Room["walls"];
      doorPosition: Room["doorPosition"];
      floorTextureId: string;
      wallTextureId: string;
      isPublic: boolean;
      password: string | null;
    }
  | { ok: false; code: string; message: string } {
  if (!data || typeof data.name !== "string" || data.name.trim().length === 0 || data.name.length > 50) {
    return { ok: false, code: "INVALID_NAME", message: "El nombre debe tener entre 1 y 50 caracteres" };
  }
  if (
    typeof data.floorTextureId !== "string" ||
    data.floorTextureId.length > 30 ||
    typeof data.wallTextureId !== "string" ||
    data.wallTextureId.length > 30
  ) {
    return { ok: false, code: "INVALID_TEXTURE", message: "Las texturas deben tener como máximo 30 caracteres" };
  }
  if (typeof data.isPublic !== "boolean") {
    return { ok: false, code: "INVALID_VISIBILITY", message: "isPublic debe ser booleano" };
  }
  if (data.password !== undefined && (typeof data.password !== "string" || data.password.length > 100)) {
    return { ok: false, code: "INVALID_PASSWORD", message: "La contraseña debe tener como máximo 100 caracteres" };
  }

  const shape = validateRoomShape(data.tiles);
  if (!shape.ok) return { ok: false, code: "INVALID_TILES", message: shape.message };

  const wallShape = validateRoomWalls(data.walls);
  if (!wallShape.ok) return { ok: false, code: "INVALID_WALLS", message: wallShape.message };

  const password =
    typeof data.password === "string" && data.password.length > 0
      ? data.password
      : existingPassword;
  if (!data.isPublic && !password) {
    return { ok: false, code: "PASSWORD_REQUIRED", message: "Las salas privadas requieren una contraseña" };
  }

  return {
    ok: true,
    name: data.name.trim(),
    tiles: shape.tiles,
    walls: wallShape.walls,
    doorPosition: generateDoorPosition(shape.tiles, wallShape.walls),
    floorTextureId: data.floorTextureId,
    wallTextureId: data.wallTextureId,
    isPublic: data.isPublic,
    password: data.isPublic ? null : password,
  };
}

async function loadRoom(roomId: string): Promise<Room | undefined> {
  const cached = roomManager.get(roomId);
  if (cached) return cached;

  const [stored] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId)).limit(1);
  if (!stored) return undefined;

  const room: Room = {
    ...stored,
    tiles: stored.tiles,
    walls: stored.walls as Room["walls"],
    doorPosition: stored.doorPosition,
    password: stored.password ?? null,
    players: new Map(),
  };
  roomManager.add(room);
  return room;
}

export function createWebSocketServer(server: import("http").Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "Token requerido");
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(1008, "Token inválido");
      return;
    }

    const { playerId, username } = payload;
    const pendingMessages: RawData[] = [];
    let messageHandler: ((raw: RawData) => Promise<void>) | null = null;

    // The browser can send immediately after its `open` event, while the
    // server is still loading the player's position, avatar, and chat history.
    // Queue those messages until the authenticated session is fully ready.
    ws.on("message", (raw: RawData) => {
      if (messageHandler) {
        void messageHandler(raw);
      } else {
        pendingMessages.push(raw);
      }
    });

    // Get initial position
    const [pos] = await db
      .select()
      .from(playerPositionsTable)
      .where(eq(playerPositionsTable.playerId, playerId))
      .limit(1);
    const posX = pos?.posX ?? Math.floor(Math.random() * 10 + 5);
    const posY = pos?.posY ?? Math.floor(Math.random() * 10 + 5);

    // Mark online
    await db.update(playersTable).set({ isOnline: true }).where(eq(playersTable.id, playerId));

    // Get avatar
    const [avatar] = await db
      .select()
      .from(avatarsTable)
      .where(eq(avatarsTable.playerId, playerId))
      .limit(1);

    const client: GameClient = {
      ws,
      playerId,
      username,
      posX,
      posY,
      avatar: avatar ?? undefined,
      positionWrite: Promise.resolve(),
    };
    const previousClient = clients.get(playerId);
    if (previousClient && previousClient.ws !== ws) {
      previousClient.ws.close(4001, "Nueva conexión");
    }
    clients.set(playerId, client);

    logger.info({ playerId, username }, "WebSocket player connected");

    // Notify others: player joined
    broadcast(
      {
        type: "player_joined",
        player: { id: playerId, username, posX, posY, avatar: avatar ?? undefined },
      },
      playerId,
    );

    // Send current players list to new client
    const currentPlayers = Array.from(clients.values())
      .filter((c) => c.playerId !== playerId)
      .map((c) => ({
        id: c.playerId,
        username: c.username,
        posX: c.posX,
        posY: c.posY,
        avatar: c.avatar,
      }));

    safeSend(ws, { type: "players_update", players: currentPlayers });

    // Send initial chat history
    const recentMessages = await db
      .select({
        id: chatMessagesTable.id,
        playerId: chatMessagesTable.playerId,
        username: playersTable.username,
        message: chatMessagesTable.message,
        createdAt: chatMessagesTable.createdAt,
      })
      .from(chatMessagesTable)
      .innerJoin(playersTable, eq(playersTable.id, chatMessagesTable.playerId))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(20);

    for (const msg of recentMessages.reverse()) {
      safeSend(ws, {
        type: "chat_message",
        id: msg.id,
        playerId: msg.playerId,
        username: msg.username,
        message: msg.message,
        createdAt: msg.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    messageHandler = async (raw) => {
      let msg: {
        type: string;
        posX?: number;
        posY?: number;
        message?: string;
        action?: string;
        payload?: string;
        duration?: number;
        data?: Record<string, unknown>;
      };
      try {
        msg = JSON.parse(raw.toString()) as typeof msg;
      } catch {
        return;
      }

      if (msg.type === "room:create" || msg.type === "room:update") {
        const data = msg.data as RoomPayload | undefined;
        let existingRoom: Room | undefined;

        if (msg.type === "room:create") {
          const [{ total }] = await db
            .select({ total: count() })
            .from(roomsTable)
            .where(eq(roomsTable.ownerId, playerId));

          if (Number(total) >= MAX_ROOMS_PER_PLAYER) {
            sendRoomError(
              ws,
              "ROOM_LIMIT_REACHED",
              `Cada jugador puede tener como máximo ${MAX_ROOMS_PER_PLAYER} salas`,
            );
            return;
          }
        }

        if (msg.type === "room:update") {
          if (typeof data?.roomId !== "string") {
            sendRoomError(ws, "INVALID_ROOM_ID", "roomId es requerido");
            return;
          }
          existingRoom = await loadRoom(data.roomId);
          if (!existingRoom) {
            sendRoomError(ws, "ROOM_NOT_FOUND", "La sala no existe");
            return;
          }
          if (existingRoom.ownerId !== playerId) {
            sendRoomError(ws, "FORBIDDEN", "Solo puedes editar tu propia sala");
            return;
          }
        }

        const validated = validateRoomPayload(data, existingRoom?.password ?? null);
        if (!validated.ok) {
          sendRoomError(ws, validated.code, validated.message);
          return;
        }

        const [saved] =
          msg.type === "room:update" && existingRoom
            ? await db
                .update(roomsTable)
                .set({
                  name: validated.name,
                  tiles: validated.tiles,
                  walls: validated.walls,
                  doorPosition: validated.doorPosition,
                  floorTextureId: validated.floorTextureId,
                  wallTextureId: validated.wallTextureId,
                  isPublic: validated.isPublic,
                  password: validated.password,
                })
                .where(eq(roomsTable.id, existingRoom.id))
                .returning()
            : await db
                .insert(roomsTable)
                .values({
                  ownerId: playerId,
                  name: validated.name,
                  tiles: validated.tiles,
                  walls: validated.walls,
                  doorPosition: validated.doorPosition,
                  floorTextureId: validated.floorTextureId,
                  wallTextureId: validated.wallTextureId,
                  isPublic: validated.isPublic,
                  password: validated.password,
                })
                .returning();

        if (!saved) {
          sendRoomError(ws, "CREATE_FAILED", "No se pudo crear la sala");
          return;
        }
        const room: Room = {
          ...saved,
          tiles: saved.tiles,
          walls: saved.walls as Room["walls"],
          doorPosition: saved.doorPosition,
          password: saved.password ?? null,
          players: new Map(),
        };
        if (msg.type === "room:update") {
          roomManager.update(room);
          safeSend(ws, roomMessage("room:updated", { roomId: room.id }));
        } else {
          roomManager.add(room);
          safeSend(ws, roomMessage("room:created", { roomId: room.id }));
        }
        return;
      }

      if (msg.type === "room:join") {
        const data = msg.data;
        if (!data || typeof data.roomId !== "string") {
          sendRoomError(ws, "INVALID_ROOM_ID", "roomId es requerido");
          return;
        }
        const room = await loadRoom(data.roomId);
        if (!room) {
          sendRoomError(ws, "ROOM_NOT_FOUND", "La sala no existe");
          return;
        }
        if (!room.isPublic && room.password !== (typeof data.password === "string" ? data.password : undefined)) {
          sendRoomError(ws, "INVALID_PASSWORD", "La contraseña de la sala es incorrecta");
          return;
        }

        const previousRoomId = roomManager.getPlayerRoomId(playerId);
        if (previousRoomId === room.id) {
          safeSend(ws, roomMessage("room:snapshot", roomManager.snapshot(room)));
          return;
        }
        if (previousRoomId && previousRoomId !== room.id) {
          roomManager.removePlayer(playerId);
          broadcastToRoom(roomManager, previousRoomId, clients, roomMessage("room:player_left", { playerId }));
        }
        roomManager.addPlayer(room.id, roomPlayer(client));
        safeSend(ws, roomMessage("room:snapshot", roomManager.snapshot(room)));
        broadcastToRoom(
          roomManager,
          room.id,
          clients,
          roomMessage("room:player_joined", { player: roomPlayer(client) }),
          playerId,
        );
        return;
      }

      if (msg.type === "move" && msg.posX !== undefined && msg.posY !== undefined) {
        const rawX = typeof msg.posX === "number" ? msg.posX : Number.NaN;
        const rawY = typeof msg.posY === "number" ? msg.posY : Number.NaN;
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

        // Keep sub-tile precision for remote interpolation. The local client
        // still owns pathfinding and collision decisions; the server only
        // validates the coordinate range and relays the logical position.
        const newX = Math.max(0, Math.min(19, rawX));
        const newY = Math.max(0, Math.min(19, rawY));

        client.posX = newX;
        client.posY = newY;

        // Broadcast first so database latency cannot add jitter to the other
        // clients. Writes are serialized so an older packet cannot overwrite
        // a newer persisted position.
        broadcast({ type: "player_moved", playerId, posX: newX, posY: newY }, playerId);
        client.positionWrite = client.positionWrite
          .then(async () => {
            await db
              .insert(playerPositionsTable)
              .values({ playerId, posX: newX, posY: newY })
              .onConflictDoUpdate({
                target: playerPositionsTable.playerId,
                set: { posX: newX, posY: newY },
              });
          })
          .catch((err) => {
            logger.error({ err, playerId }, "Failed to persist player position");
          });
      } else if (msg.type === "chat" && msg.message) {
        const text = String(msg.message).slice(0, 200).trim();
        if (!text) return;

        const [saved] = await db
          .insert(chatMessagesTable)
          .values({ playerId, message: text })
          .returning();

        // Exclude sender — client shows their own message optimistically
        broadcast(
          {
            type: "chat_message",
            id: saved?.id,
            playerId,
            username,
            message: text,
            createdAt: saved?.createdAt?.toISOString() ?? new Date().toISOString(),
          },
          playerId,
        );
      } else if (msg.type === "action") {
        const allowedActions = new Set(["dance", "sit", "standup", "dig", "fish", "axe", "interact", "emote"]);
        if (!msg.action || !allowedActions.has(msg.action)) return;

        const duration = Number.isFinite(msg.duration)
          ? Math.max(0, Math.min(60000, msg.duration!))
          : 0;
        const payload = typeof msg.payload === "string" ? msg.payload.slice(0, 16) : undefined;

        // Actions are transient client-side animation state. Relay them
        // immediately; they do not belong in the persisted player position.
        broadcast(
          {
            type: "player_action",
            playerId,
            action: msg.action,
            payload,
            duration,
          },
          playerId,
        );
      }
    };

    for (const raw of pendingMessages.splice(0)) {
      void messageHandler(raw);
    }

    ws.on("close", async () => {
      // A fast reconnect can replace this socket in the map before the old
      // socket emits close. Never let the old socket mark the new session
      // offline or remove its presence.
      if (clients.get(playerId)?.ws !== ws) return;

      clients.delete(playerId);
      logger.info({ playerId, username }, "WebSocket player disconnected");

      await db.update(playersTable).set({ isOnline: false }).where(eq(playersTable.id, playerId));

      // Save last known position
      await client.positionWrite;
      await db
        .insert(playerPositionsTable)
        .values({ playerId, posX: client.posX, posY: client.posY })
        .onConflictDoUpdate({
          target: playerPositionsTable.playerId,
          set: { posX: client.posX, posY: client.posY },
        });

      const roomId = roomManager.getPlayerRoomId(playerId);
      if (roomId) {
        roomManager.removePlayer(playerId);
        broadcastToRoom(roomManager, roomId, clients, roomMessage("room:player_left", { playerId }));
      }
      broadcast({ type: "player_left", playerId });
    });

    ws.on("error", (err) => {
      logger.error({ err, playerId }, "WebSocket error");
    });
  });

  return wss;
}
