import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, chatMessagesTable } from "@workspace/db";
import { eq, gte, count } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/plaza/status", async (_req, res) => {
  const [onlineResult] = await db
    .select({ count: count() })
    .from(playersTable)
    .where(eq(playersTable.isOnline, true));

  const [totalResult] = await db.select({ count: count() }).from(playersTable);

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [messagesResult] = await db
    .select({ count: count() })
    .from(chatMessagesTable)
    .where(gte(chatMessagesTable.createdAt, yesterday));

  res.json({
    onlineCount: onlineResult?.count ?? 0,
    totalPlayers: totalResult?.count ?? 0,
    messagesLast24h: messagesResult?.count ?? 0,
  });
});

export default router;
