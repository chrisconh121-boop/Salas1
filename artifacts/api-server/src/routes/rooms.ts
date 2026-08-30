import { Router } from "express";
import { db, playersTable, roomsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

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

export default router;