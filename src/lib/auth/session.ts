import type { Customer } from "../types";
import { randomToken, sha256Hex } from "./tokens";

export const SESSION_COOKIE = "__Host-sm_session";
export const SESSION_DAYS = 30;

export async function createSession(db: D1Database, customerId: string, now: Date) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db
    .prepare("INSERT INTO sessions (session_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), customerId, now.toISOString(), expiresAt.toISOString())
    .run();
  return { token, expiresAt };
}

export async function getSessionCustomer(db: D1Database, token: string | undefined, now: Date): Promise<Customer | null> {
  if (!token) return null;
  const r = await db
    .prepare(
      `SELECT c.id, c.email, c.created_at FROM sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.session_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), now.toISOString())
    .first<any>();
  return r ? { id: r.id, email: r.email, createdAt: r.created_at } : null;
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(await sha256Hex(token)).run();
}

export function sessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
