import { Router } from "express";
import { db, playersTable, roomsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { roomManager } from "../lib/room-manager";

const router = Router();

const roomFields = {
  id: roomsTable.id,
  ownerId: roomsTable.ownerId,
  name: roomsTable.name,
  tiles: roomsTable.tiles,
  walls: roomsTable.walls,
  doorPosition: roomsTable.doorPosition,
  floorTextureId: roomsTable.floorTextureId,
  wallTextureId: roomsTable.wallTextureId,
  isPublic: roomsTable.isPublic,
  hasPassword: roomsTable.password,
  createdAt: roomsTable.createdAt,
};

function serializeRoom(room: { hasPassword: string | null; [key: string]: unknown }) {
  return {
    ...room,
    hasPassword: room.hasPassword !== null,
  };
}

router.get("/rooms/public", requireAuth as any, async (_req: AuthRequest, res) => {
  const rooms = await db
    .select({
      id: roomsTable.id,
      ownerId: roomsTable.ownerId,
      ownerUsername: playersTable.username,
      name: roomsTable.name,
      hasPassword: roomsTable.password,
      createdAt: roomsTable.createdAt,
    })
    .from(roomsTable)
    .innerJoin(playersTable, eq(playersTable.id, roomsTable.ownerId))
    .where(eq(roomsTable.isPublic, true))
    .orderBy(desc(roomsTable.createdAt))
    .limit(50);

  res.json(
    rooms.map((room) => ({
      ...room,
      hasPassword: room.hasPassword !== null,
    })),
  );
});

router.get("/rooms/mine", requireAuth as any, async (req: AuthRequest, res) => {
  const [room] = await db
    .select({
      id: roomsTable.id,
      ownerId: roomsTable.ownerId,
      name: roomsTable.name,
      tiles: roomsTable.tiles,
      walls: roomsTable.walls,
      doorPosition: roomsTable.doorPosition,
      floorTextureId: roomsTable.floorTextureId,
      wallTextureId: roomsTable.wallTextureId,
      isPublic: roomsTable.isPublic,
      hasPassword: roomsTable.password,
      createdAt: roomsTable.createdAt,
    })
    .from(roomsTable)
    .where(eq(roomsTable.ownerId, req.player!.id))
    .orderBy(desc(roomsTable.createdAt))
    .limit(1);

  if (!room) {
    res.status(404).json({ error: "Habitación no encontrada" });
    return;
  }

  res.json({
    ...room,
    hasPassword: room.hasPassword !== null,
  });
});

router.get("/rooms/mine/all", requireAuth as any, async (req: AuthRequest, res) => {
  const rooms = await db
    .select(roomFields)
    .from(roomsTable)
    .where(eq(roomsTable.ownerId, req.player!.id))
    .orderBy(desc(roomsTable.createdAt));

  res.json(rooms.map(serializeRoom));
});

router.delete("/rooms/mine/:roomId", requireAuth as any, async (req: AuthRequest, res): Promise<void> => {
  const roomId = req.params.roomId;
  if (typeof roomId !== "string" || !roomId) {
    res.status(400).json({ error: "ID de sala inválido" });
    return;
  }

  const [deleted] = await db
    .delete(roomsTable)
    .where(and(eq(roomsTable.id, roomId), eq(roomsTable.ownerId, req.player!.id)))
    .returning({ id: roomsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  roomManager.remove(roomId);
  res.sendStatus(204);
});

export default router;