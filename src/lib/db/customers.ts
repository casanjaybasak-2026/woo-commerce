import type { Customer } from "../types";

export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const toCustomer = (r: any): Customer => ({ id: r.id, email: r.email, createdAt: r.created_at });

export async function getCustomerByEmail(db: D1Database, email: string): Promise<Customer | null> {
  const r = await db.prepare("SELECT * FROM customers WHERE email = ?").bind(normalizeEmail(email)).first();
  return r ? toCustomer(r) : null;
}

export async function upsertCustomer(db: D1Database, email: string, now: Date): Promise<Customer> {
  const e = normalizeEmail(email);
  await db
    .prepare("INSERT OR IGNORE INTO customers (id, email, created_at) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), e, now.toISOString())
    .run();
  return (await getCustomerByEmail(db, e))!;
}
