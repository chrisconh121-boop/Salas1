import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { playersTable, avatarsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signToken, requireAuth, type AuthRequest } from "../lib/auth";

const router = Router();

function readCredentials(body: unknown): { username: string; password: string } | null {
  if (!body || typeof body !== "object") return null;

  const input = body as { username?: unknown; password?: unknown };
  if (typeof input.username !== "string" || typeof input.password !== "string") {
    return null;
  }

  const username = input.username.trim();
  if (!username || !input.password) return null;

  return { username, password: input.password };
}

router.post("/auth/register", async (req, res) => {
  const credentials = readCredentials(req.body);

  if (!credentials) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    return;
  }
  const { username, password } = credentials;
  if (username.length < 3 || username.length > 20) {
    res.status(400).json({ error: "El usuario debe tener entre 3 y 20 caracteres" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const existing = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`)
    .limit(1);
  if (existing.length) {
    res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [player] = await db.insert(playersTable).values({ username, passwordHash }).returning();
  if (!player) {
    res.status(500).json({ error: "Error al crear el jugador" });
    return;
  }

  const token = signToken({ playerId: player.id, username: player.username });
  res.status(201).json({
    player: { id: player.id, username: player.username, createdAt: player.createdAt, isOnline: false },
    token,
  });
});

router.post("/auth/login", async (req, res) => {
  const credentials = readCredentials(req.body);

  if (!credentials) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    return;
  }
  const { username, password } = credentials;

  const [player] = await db
    .select()
    .from(playersTable)
    .where(sql`lower(${playersTable.username}) = lower(${username})`)
    .limit(1);
  if (!player) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, player.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  await db.update(playersTable).set({ isOnline: true }).where(eq(playersTable.id, player.id));

  const avatar = await db.select().from(avatarsTable).where(eq(avatarsTable.playerId, player.id)).limit(1);
  const token = signToken({ playerId: player.id, username: player.username });

  res.json({
    player: {
      id: player.id,
      username: player.username,
      createdAt: player.createdAt,
      isOnline: true,
      avatar: avatar[0] ?? undefined,
    },
    token,
  });
});

router.post("/auth/logout", requireAuth as any, async (req: AuthRequest, res) => {
  if (req.player) {
    await db.update(playersTable).set({ isOnline: false }).where(eq(playersTable.id, req.player.id));
  }
  res.json({ success: true });
});

router.get("/auth/me", requireAuth as any, async (req: AuthRequest, res) => {
  const player = req.player!;
  const [row] = await db.select().from(playersTable).where(eq(playersTable.id, player.id)).limit(1);
  if (!row) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const avatar = await db.select().from(avatarsTable).where(eq(avatarsTable.playerId, player.id)).limit(1);
  res.json({
    id: row.id,
    username: row.username,
    createdAt: row.createdAt,
    isOnline: row.isOnline,
    avatar: avatar[0] ?? undefined,
  });
});

export default router;
