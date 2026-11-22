import { getCustomerByEmail, isValidEmail, normalizeEmail } from "../db/customers";
import type { Mailer } from "../email/mailer";
import { loginLinkEmail } from "../email/templates";
import { createSession } from "./session";
import { randomToken, sha256Hex } from "./tokens";

export const LOGIN_TTL_MINUTES = 15;
export const ORDER_LINK_TTL_MINUTES = 72 * 60;
export const LOGIN_REQUESTS_PER_HOUR = 5;

export async function issueLoginLink(db: D1Database, email: string, siteUrl: string, now: Date, ttlMinutes: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), normalizeEmail(email), now.toISOString(), new Date(now.getTime() + ttlMinutes * 60_000).toISOString())
    .run();
  return `${siteUrl.replace(/\/$/, "")}/auth/verify?token=${token}`;
}

/** Sends a sign-in link if the email belongs to a customer. Always resolves the same way so callers can't probe emails. */
export async function requestLogin(
  deps: { db: D1Database; mailer: Mailer; siteUrl: string; storeName: string; now: () => Date },
  rawEmail: string,
): Promise<void> {
  const { db, mailer, siteUrl, storeName } = deps;
  const now = deps.now();
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return;
  const customer = await getCustomerByEmail(db, email);
  if (!customer) return;
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, since)
    .first<number>("n");
  if (Number(recent) >= LOGIN_REQUESTS_PER_HOUR) return;
  const loginUrl = await issueLoginLink(db, email, siteUrl, now, LOGIN_TTL_MINUTES);
  await mailer.send({ to: email, ...loginLinkEmail({ storeName, loginUrl }) });
}

/** Consumes a login token. Returns a new session, or null if the token is unknown, used or expired. */
export async function verifyLogin(deps: { db: D1Database; now: () => Date }, token: string) {
  const { db } = deps;
  const now = deps.now();
  if (!token || token.length > 128) return null;
  const hash = await sha256Hex(token);
  // Atomically mark as used so a token can't be redeemed twice.
  const used = await db
    .prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now.toISOString(), hash, now.toISOString())
    .run();
  if (!used.meta.changes) return null;
  const row = await db.prepare("SELECT email FROM login_tokens WHERE token_hash = ?").bind(hash).first<{ email: string }>();
  const customer = row && (await getCustomerByEmail(db, row.email));
  if (!customer) return null;
  const s = await createSession(db, customer.id, now);
  return { sessionToken: s.token, expiresAt: s.expiresAt };
}
