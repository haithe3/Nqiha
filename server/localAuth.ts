import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { authSessions, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";

export const LOCAL_SESSION_COOKIE = "nqiha_session";
export const OWNER_USERNAME = process.env.OWNER_USERNAME ?? "naqiha_mobile_wash";
const OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH ?? "$2b$12$SzBFUbGhJyhEt85SJnC6sOxRII3V6X4IUChdG.VhNJrXNxlbt7R1.";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(req: Request, name: string) {
  const prefix = `${name}=`;
  return req.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
}

export async function ensureOwner() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(users).where(eq(users.username, OWNER_USERNAME)).limit(1);
  if (!existing[0]) {
    await db.insert(users).values({ username: OWNER_USERNAME, passwordHash: OWNER_PASSWORD_HASH, name: "مالك نقيها", loginMethod: "local", role: "owner", isActive: 1 });
  }
}

export async function createLocalUser(input: { name: string; email: string; password: string; phone: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await db.insert(users).values({ name: input.name, email: input.email.toLowerCase(), passwordHash, phone: input.phone, loginMethod: "local", role: "customer", isActive: 1 });
  return Number(result[0].insertId);
}

export async function verifyLocalCredentials(usernameOrEmail: string, password: string) {
  await ensureOwner();
  const db = await getDb();
  if (!db) return null;
  const normalized = usernameOrEmail.toLowerCase();
  const result = await db.select().from(users).where(eq(users.username, usernameOrEmail)).limit(1);
  const byEmail = result[0] ? result : await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const user = byEmail[0];
  if (!user || !user.isActive || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return user;
}

export async function createLocalSession(userId: number, res: Response, req: Request) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.insert(authSessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  res.cookie(LOCAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(req), maxAge: 1000 * 60 * 60 * 24 * 30 });
}

export async function getLocalUserFromRequest(req: Request): Promise<User | null> {
  const token = readCookie(req, LOCAL_SESSION_COOKIE);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ user: users }).from(authSessions).innerJoin(users, eq(authSessions.userId, users.id)).where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date()), eq(users.isActive, 1))).limit(1);
  return result[0]?.user ?? null;
}

export async function clearLocalSession(req: Request, res: Response) {
  const token = readCookie(req, LOCAL_SESSION_COOKIE);
  const db = await getDb();
  if (db && token) await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
  if (token) res.clearCookie(LOCAL_SESSION_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });
}
