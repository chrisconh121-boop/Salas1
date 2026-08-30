import type { WebSocket } from "ws";

export interface RoomTile {
  x: number;
  y: number;
}

export interface RoomWall extends RoomTile {
  side: "north" | "east" | "south" | "west";
}

export interface DoorPosition extends RoomTile {}

export interface RoomPlayer {
  id: number;
  username: string;
  posX: number;
  posY: number;
}

export interface Room {
  id: string;
  ownerId: number;
  name: string;
  tiles: RoomTile[];
  walls: RoomWall[];
  doorPosition: DoorPosition;
  floorTextureId: string;
  wallTextureId: string;
  isPublic: boolean;
  password: string | null;
  createdAt: Date;
  players: Map<number, RoomPlayer>;
}

const MAX_TILES = 400;

function tileKey(tile: RoomTile): string {
  return `${tile.x},${tile.y}`;
}

function isTile(value: unknown): value is RoomTile {
  if (!value || typeof value !== "object") return false;
  const tile = value as Record<string, unknown>;
  return Number.isInteger(tile.x) && Number.isInteger(tile.y);
}

export function validateRoomShape(
  tiles: unknown,
): { ok: true; tiles: RoomTile[] } | { ok: false; message: string } {
  if (!Array.isArray(tiles) || tiles.length === 0) {
    return { ok: false, message: "La sala debe tener al menos un tile" };
  }
  if (tiles.length > MAX_TILES) {
    return { ok: false, message: `La sala no puede superar ${MAX_TILES} tiles` };
  }
  if (!tiles.every(isTile)) {
    return { ok: false, message: "Cada tile debe tener coordenadas enteras x e y" };
  }

  const normalizedTiles = tiles as RoomTile[];
  const keys = new Set(normalizedTiles.map(tileKey));
  if (keys.size !== normalizedTiles.length) {
    return { ok: false, message: "La sala no puede contener tiles repetidos" };
  }

  const visited = new Set<string>();
  const queue = [normalizedTiles[0]];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = tileKey(current);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);
    for (const neighbor of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (keys.has(tileKey(neighbor)) && !visited.has(tileKey(neighbor))) {
        queue.push(neighbor);
      }
    }
  }

  if (visited.size !== normalizedTiles.length) {
    return { ok: false, message: "Todos los tiles de la sala deben estar conectados" };
  }
  return { ok: true, tiles: normalizedTiles };
}

export function validateRoomWalls(
  walls: unknown,
): { ok: true; walls: RoomWall[] } | { ok: false; message: string } {
  if (!Array.isArray(walls)) {
    return { ok: false, message: "La sala debe definir sus paredes explícitamente" };
  }
  if (walls.length > MAX_TILES) {
    return { ok: false, message: `La sala no puede superar ${MAX_TILES} paredes` };
  }
  const validSides = new Set<RoomWall["side"]>(["north", "east", "south", "west"]);
  const isRoomWall = (value: unknown): value is RoomWall => {
    if (!value || typeof value !== "object") return false;
    const wall = value as Record<string, unknown>;
    return Number.isInteger(wall.x) &&
      Number.isInteger(wall.y) &&
      typeof wall.side === "string" &&
      validSides.has(wall.side as RoomWall["side"]);
  };
  if (!walls.every(isRoomWall)) {
    return { ok: false, message: "Cada pared debe tener coordenadas enteras y un lado válido" };
  }
  const normalizedWalls = walls;
  const keys = new Set(normalizedWalls.map((wall) => `${wall.x},${wall.y},${wall.side}`));
  if (keys.size !== normalizedWalls.length) {
    return { ok: false, message: "La sala no puede contener paredes repetidas" };
  }
  return { ok: true, walls: normalizedWalls };
}

export function generateDoorPosition(tiles: RoomTile[], walls: RoomWall[]): DoorPosition {
  const perimeterTile = walls
    .map(({ x, y }) => ({ x, y }))
    .find((tile, index, all) => index === all.findIndex((candidate) => tileKey(candidate) === tileKey(tile)));
  return perimeterTile ?? tiles[0];
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRooms = new Map<number, string>();

  add(room: Room): void {
    this.rooms.set(room.id, room);
  }

  update(room: Room): void {
    const current = this.rooms.get(room.id);
    this.rooms.set(room.id, {
      ...room,
      players: current?.players ?? new Map(),
    });
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getPlayerRoomId(playerId: number): string | undefined {
    return this.playerRooms.get(playerId);
  }

  addPlayer(roomId: string, player: RoomPlayer): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.players.set(player.id, player);
    this.playerRooms.set(player.id, roomId);
    return true;
  }

  removePlayer(playerId: number): RoomPlayer | undefined {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    room?.players.delete(playerId);
    this.playerRooms.delete(playerId);
    return player;
  }

  snapshot(room: Room): Omit<Room, "password" | "players"> & { players: RoomPlayer[] } {
    const { password: _password, players, ...roomData } = room;
    return { ...roomData, players: Array.from(players.values()) };
  }
}

export function broadcastToRoom(
  roomManager: RoomManager,
  roomId: string,
  clients: Map<number, { ws: WebSocket }>,
  message: unknown,
  excludePlayerId?: number,
): void {
  const room = roomManager.get(roomId);
  if (!room) return;
  for (const playerId of room.players.keys()) {
    if (playerId === excludePlayerId) continue;
    const client = clients.get(playerId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

export { MAX_TILES };