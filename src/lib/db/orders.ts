import { randomToken } from "../auth/tokens";
import type { CartLine, Order, OrderItem, OrderStatus } from "../types";

const toOrder = (r: any): Order => ({
  id: r.id,
  publicId: r.public_id,
  customerEmail: r.customer_email ?? null,
  customerId: r.customer_id ?? null,
  status: r.status,
  subtotalCents: Number(r.subtotal_cents),
  discountCents: Number(r.discount_cents),
  totalCents: Number(r.total_cents),
  currency: r.currency,
  stripeSessionId: r.stripe_session_id ?? null,
  stripePaymentIntent: r.stripe_payment_intent ?? null,
  createdAt: r.created_at,
  paidAt: r.paid_at ?? null,
});

const toItem = (r: any): OrderItem => ({
  id: r.id,
  orderId: r.order_id,
  productId: r.product_id,
  titleSnapshot: r.title_snapshot,
  priceCentsSnapshot: Number(r.price_cents_snapshot),
});

export async function createPendingOrder(
  db: D1Database,
  args: { lines: CartLine[]; subtotalCents: number; currency?: string; now: Date },
): Promise<Order> {
  const id = crypto.randomUUID();
  const publicId = randomToken(9).toUpperCase().replace(/[-_]/g, "X");
  const ts = args.now.toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO orders (id, public_id, status, subtotal_cents, discount_cents, total_cents, currency, created_at) VALUES (?, ?, 'pending', ?, 0, ?, ?, ?)",
      )
      .bind(id, publicId, args.subtotalCents, args.subtotalCents, args.currency ?? "usd", ts),
    ...args.lines.map((l) =>
      db
        .prepare("INSERT INTO order_items (id, order_id, product_id, title_snapshot, price_cents_snapshot) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, l.productId, l.title, l.priceCents),
    ),
  ]);
  return (await getOrderById(db, id))!;
}

export async function setStripeSession(db: D1Database, orderId: string, sessionId: string) {
  await db.prepare("UPDATE orders SET stripe_session_id = ? WHERE id = ?").bind(sessionId, orderId).run();
}

export async function getOrderById(db: D1Database, id: string): Promise<Order | null> {
  const r = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  return r ? toOrder(r) : null;
}

export async function getOrderByPublicId(db: D1Database, publicId: string): Promise<Order | null> {
  const r = await db.prepare("SELECT * FROM orders WHERE public_id = ?").bind(publicId).first();
  return r ? toOrder(r) : null;
}

export async function getOrderByPaymentIntent(db: D1Database, pi: string): Promise<Order | null> {
  const r = await db.prepare("SELECT * FROM orders WHERE stripe_payment_intent = ?").bind(pi).first();
  return r ? toOrder(r) : null;
}

export async function listOrderItems(db: D1Database, orderId: string): Promise<OrderItem[]> {
  const { results } = await db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid").bind(orderId).all();
  return results.map(toItem);
}

/** Transitions pending -> paid. Returns false if the order was not pending (already handled). */
export async function markPaid(
  db: D1Database,
  orderId: string,
  a: { email: string; customerId: string; subtotalCents: number; discountCents: number; totalCents: number; paymentIntent: string | null; now: Date },
): Promise<boolean> {
  const r = await db
    .prepare(
      `UPDATE orders SET status='paid', customer_email=?, customer_id=?, subtotal_cents=?, discount_cents=?, total_cents=?,
       stripe_payment_intent=?, paid_at=? WHERE id=? AND status='pending'`,
    )
    .bind(a.email, a.customerId, a.subtotalCents, a.discountCents, a.totalCents, a.paymentIntent, a.now.toISOString(), orderId)
    .run();
  return Boolean(r.meta.changes);
}

export async function markExpired(db: D1Database, orderId: string): Promise<boolean> {
  const r = await db.prepare("UPDATE orders SET status='expired' WHERE id=? AND status='pending'").bind(orderId).run();
  return Boolean(r.meta.changes);
}

export async function markRefunded(db: D1Database, orderId: string, now: Date): Promise<boolean> {
  const r = await db.batch([
    db.prepare("UPDATE orders SET status='refunded' WHERE id=? AND status='paid'").bind(orderId),
    db.prepare("UPDATE entitlements SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL").bind(now.toISOString(), orderId),
  ]);
  return Boolean(r[0].meta.changes);
}

export async function listOrders(
  db: D1Database,
  opts: { status?: OrderStatus; limit?: number; offset?: number } = {},
): Promise<Order[]> {
  const where = opts.status ? "WHERE status = ?" : "";
  const params: unknown[] = opts.status ? [opts.status] : [];
  const { results } = await db
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, opts.limit ?? 50, opts.offset ?? 0)
    .all();
  return results.map(toOrder);
}

export async function orderStats(db: D1Database, since: Date) {
  const r = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) AS products,
        (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS paid_orders,
        (SELECT COALESCE(SUM(total_cents), 0) FROM orders WHERE status = 'paid' AND paid_at >= ?) AS revenue_cents`,
    )
    .bind(since.toISOString())
    .first<any>();
  return { products: Number(r.products), paidOrders: Number(r.paid_orders), revenueCents30d: Number(r.revenue_cents) };
}
