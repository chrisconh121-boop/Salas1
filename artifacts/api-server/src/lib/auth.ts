import jwt from "jsonwebtoken";
import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env["SESSION_SECRET"] ?? "";

if (!JWT_SECRET) {
  throw new Error("SESSION_SECRET must be set before starting the API server");
}

export interface JwtPayload {
  playerId: number;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export interface AuthRequest extends Request {
  player?: { id: number; username: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const players = await db.select().from(playersTable).where(eq(playersTable.id, payload.playerId)).limit(1);
  if (!players.length) {
    res.status(401).json({ error: "Jugador no encontrado" });
    return;
  }

  req.player = { id: payload.playerId, username: payload.username };
  next();
}
