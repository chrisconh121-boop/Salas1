import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, avatarsTable, playerPositionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/players/online", async (_req, res) => {
  const online = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      skinColor: avatarsTable.skinColor,
      hairColor: avatarsTable.hairColor,
      hairStyle: avatarsTable.hairStyle,
      shirtColor: avatarsTable.shirtColor,
      pantsColor: avatarsTable.pantsColor,
      hatStyle: avatarsTable.hatStyle,
      accessory: avatarsTable.accessory,
      posX: playerPositionsTable.posX,
      posY: playerPositionsTable.posY,
    })
    .from(playersTable)
    .leftJoin(avatarsTable, eq(avatarsTable.playerId, playersTable.id))
    .leftJoin(playerPositionsTable, eq(playerPositionsTable.playerId, playersTable.id))
    .where(eq(playersTable.isOnline, true));

  const result = online.map((p) => ({
    id: p.id,
    username: p.username,
    avatar: p.skinColor
      ? {
          id: 0,
          playerId: p.id,
          skinColor: p.skinColor,
          hairColor: p.hairColor!,
          hairStyle: p.hairStyle!,
          shirtColor: p.shirtColor!,
          pantsColor: p.pantsColor!,
          hatStyle: p.hatStyle ?? null,
          accessory: p.accessory ?? null,
        }
      : undefined,
    posX: p.posX ?? null,
    posY: p.posY ?? null,
  }));

  res.json(result);
});

router.get("/players/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id)).limit(1);
  if (!player) {
    res.status(404).json({ error: "Jugador no encontrado" });
    return;
  }

  const avatar = await db.select().from(avatarsTable).where(eq(avatarsTable.playerId, id)).limit(1);

  res.json({
    id: player.id,
    username: player.username,
    createdAt: player.createdAt,
    isOnline: player.isOnline,
    avatar: avatar[0] ?? undefined,
  });
});

export default router;
