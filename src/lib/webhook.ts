import { issueLoginLink, ORDER_LINK_TTL_MINUTES } from "./auth/login";
import { normalizeEmail, upsertCustomer } from "./db/customers";
import { getOrderById, getOrderByPaymentIntent, listOrderItems, markExpired, markPaid, markRefunded } from "./db/orders";
import type { Mailer } from "./email/mailer";
import { orderConfirmationEmail } from "./email/templates";
import type { StripeEventLike } from "./payments";

export interface WebhookDeps {
  db: D1Database;
  mailer: Mailer;
  siteUrl: string;
  storeName: string;
  now: () => Date;
}

export type WebhookResult = "processed" | "duplicate" | "ignored";

const idOf = (v: unknown): string | null => (typeof v === "string" ? v : (v as { id?: string } | null)?.id ?? null);

export async function handleStripeEvent(deps: WebhookDeps, event: StripeEventLike): Promise<WebhookResult> {
  const { db } = deps;
  const seen = await db.prepare("SELECT 1 AS x FROM stripe_events WHERE event_id = ?").bind(event.id).first();
  if (seen) return "duplicate";

  const result = await dispatch(deps, event);

  // Recorded after processing so a crash mid-way lets Stripe's retry try again.
  // Double-processing is prevented by the conditional status transitions.
  await db
    .prepare("INSERT OR IGNORE INTO stripe_events (event_id, type, processed_at) VALUES (?, ?, ?)")
    .bind(event.id, event.type, deps.now().toISOString())
    .run();
  return result;
}

async function dispatch(deps: WebhookDeps, event: StripeEventLike): Promise<WebhookResult> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (obj.payment_status !== "paid") return "ignored";
      return fulfil(deps, obj);
    case "checkout.session.expired": {
      const orderId = obj.metadata?.order_id ?? obj.client_reference_id;
      return orderId && (await markExpired(deps.db, orderId)) ? "processed" : "ignored";
    }
    case "charge.refunded": {
      if (obj.refunded !== true) return "ignored"; // partial refund: keep access
      const pi = idOf(obj.payment_intent);
      const order = pi ? await getOrderByPaymentIntent(deps.db, pi) : null;
      return order && (await markRefunded(deps.db, order.id, deps.now())) ? "processed" : "ignored";
    }
    default:
      return "ignored";
  }
}

async function fulfil(deps: WebhookDeps, s: any): Promise<WebhookResult> {
  const { db } = deps;
  const now = deps.now();
  const orderId: string | undefined = s.metadata?.order_id ?? s.client_reference_id;
  const order = orderId ? await getOrderById(db, orderId) : null;
  if (!order || order.status !== "pending") return "ignored";

  const email = normalizeEmail(s.customer_details?.email ?? s.customer_email ?? "");
  if (!email) {
    console.error(`[webhook] session ${s.id} has no email; order ${order.id} left pending`);
    return "ignored";
  }
  const customer = await upsertCustomer(db, email, now);
  const discount = Number(s.total_details?.amount_discount ?? 0);
  const paid = await markPaid(db, order.id, {
    email,
    customerId: customer.id,
    subtotalCents: Number(s.amount_subtotal ?? order.subtotalCents),
    discountCents: discount,
    totalCents: Number(s.amount_total ?? order.subtotalCents - discount),
    paymentIntent: idOf(s.payment_intent),
    now,
  });
  if (!paid) return "ignored"; // another delivery won the race

  const items = await listOrderItems(db, order.id);
  await db.batch(
    items.map((i) =>
      db
        .prepare("INSERT OR IGNORE INTO entitlements (id, customer_id, product_id, order_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), customer.id, i.productId, order.id, now.toISOString()),
    ),
  );

  try {
    await sendOrderEmail(deps, order.id);
  } catch (err) {
    console.error(`[webhook] order ${order.id} paid but confirmation email failed:`, err);
  }
  return "processed";
}

/** Sends (or re-sends) the order confirmation with a fresh 72-hour sign-in link. */
export async function sendOrderEmail(deps: Omit<WebhookDeps, "now"> & { now: () => Date }, orderId: string): Promise<void> {
  const order = await getOrderById(deps.db, orderId);
  if (!order || order.status !== "paid" || !order.customerEmail) throw new Error("Order is not paid");
  const items = await listOrderItems(deps.db, orderId);
  const loginUrl = await issueLoginLink(deps.db, order.customerEmail, deps.siteUrl, deps.now(), ORDER_LINK_TTL_MINUTES);
  await deps.mailer.send({
    to: order.customerEmail,
    ...orderConfirmationEmail({ storeName: deps.storeName, siteUrl: deps.siteUrl, order, items, loginUrl }),
  });
}
