import { Router } from "express";
import { db, roomsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

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