import { Router } from "express";
import { db } from "@workspace/db";
import { chatMessagesTable, playersTable, avatarsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/chat/messages", async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);

  const messages = await db
    .select({
      id: chatMessagesTable.id,
      playerId: chatMessagesTable.playerId,
      username: playersTable.username,
      message: chatMessagesTable.message,
      createdAt: chatMessagesTable.createdAt,
      avatarSkinColor: avatarsTable.skinColor,
      avatarHairColor: avatarsTable.hairColor,
      avatarShirtColor: avatarsTable.shirtColor,
    })
    .from(chatMessagesTable)
    .innerJoin(playersTable, eq(playersTable.id, chatMessagesTable.playerId))
    .leftJoin(avatarsTable, eq(avatarsTable.playerId, chatMessagesTable.playerId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  res.json(messages.reverse());
});

export default router;
