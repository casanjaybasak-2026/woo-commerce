import { createTestDb } from "./helpers/d1";
import { FakeMailer, clock, seedProduct } from "./helpers/fakes";
import { handleStripeEvent } from "../src/lib/webhook";
import { createPendingOrder, getOrderById } from "../src/lib/db/orders";

async function setup() {
  const db = await createTestDb();
  const mailer = new FakeMailer();
  const now = clock();
  await seedProduct(db, { id: "p1", title: "One", priceCents: 1900 });
  const order = await createPendingOrder(db, { lines: [{ productId: "p1", title: "One", slug: "p1", priceCents: 1900 }], subtotalCents: 1900, now: now() });
  const deps = { db, mailer, siteUrl: "https://s.test", storeName: "Shelfmade", now };
  return { db, mailer, order, deps };
}

const session = (orderId: string, extra: Record<string, unknown> = {}) => ({
  id: "cs_test_1",
  payment_status: "paid",
  metadata: { order_id: orderId },
  customer_details: { email: "Buyer@Example.com" },
  amount_subtotal: 1900,
  amount_total: 1900,
  total_details: { amount_discount: 0 },
  payment_intent: "pi_1",
  ...extra,
});
const ev = (id: string, type: string, object: unknown) => ({ id, type, data: { object } });
const entitlements = (db: D1Database) => db.prepare("SELECT * FROM entitlements").all<any>().then((r) => r.results);

test("checkout.session.completed paid: marks paid, creates entitlement, emails buyer", async () => {
  const { db, mailer, order, deps } = await setup();
  expect(await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id)))).toBe("processed");
  expect(await getOrderById(db, order.id)).toMatchObject({ status: "paid", customerEmail: "buyer@example.com", stripePaymentIntent: "pi_1" });
  expect(await entitlements(db)).toHaveLength(1);
  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0].to).toBe("buyer@example.com");
  expect(mailer.sent[0].html).toContain("/auth/verify?token=");
});

test("records totals from the session (promo code)", async () => {
  const { db, order, deps } = await setup();
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id, { amount_total: 1520, total_details: { amount_discount: 380 } })));
  expect(await getOrderById(db, order.id)).toMatchObject({ subtotalCents: 1900, discountCents: 380, totalCents: 1520 });
});

test('returns "duplicate" and sends no email on a repeated event id', async () => {
  const { db, mailer, order, deps } = await setup();
  const e = ev("evt_1", "checkout.session.completed", session(order.id));
  await handleStripeEvent(deps, e);
  expect(await handleStripeEvent(deps, e)).toBe("duplicate");
  expect(mailer.sent).toHaveLength(1);
  expect(await entitlements(db)).toHaveLength(1);
});

test("unpaid (async) session is ignored until async_payment_succeeded", async () => {
  const { db, mailer, order, deps } = await setup();
  expect(await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id, { payment_status: "unpaid" })))).toBe("ignored");
  expect((await getOrderById(db, order.id))!.status).toBe("pending");
  expect(await handleStripeEvent(deps, ev("evt_2", "checkout.session.async_payment_succeeded", session(order.id)))).toBe("processed");
  expect((await getOrderById(db, order.id))!.status).toBe("paid");
  expect(mailer.sent).toHaveLength(1);
});

test("an already-paid order is not re-processed by a different event", async () => {
  const { mailer, order, deps } = await setup();
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id)));
  expect(await handleStripeEvent(deps, ev("evt_2", "checkout.session.async_payment_succeeded", session(order.id)))).toBe("ignored");
  expect(mailer.sent).toHaveLength(1);
});

test('unknown order id is "ignored"', async () => {
  const { deps } = await setup();
  expect(await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session("nope")))).toBe("ignored");
});

test("unhandled event types are ignored", async () => {
  const { deps } = await setup();
  expect(await handleStripeEvent(deps, ev("evt_1", "customer.created", {}))).toBe("ignored");
});

test("checkout.session.expired marks order expired", async () => {
  const { db, order, deps } = await setup();
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.expired", session(order.id, { payment_status: "unpaid" })));
  expect((await getOrderById(db, order.id))!.status).toBe("expired");
});

test("full refund marks order refunded and revokes entitlements", async () => {
  const { db, order, deps } = await setup();
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id)));
  expect(await handleStripeEvent(deps, ev("evt_2", "charge.refunded", { payment_intent: "pi_1", refunded: true }))).toBe("processed");
  expect((await getOrderById(db, order.id))!.status).toBe("refunded");
  expect((await entitlements(db))[0].revoked_at).toBeTruthy();
});

test("partial refund keeps access", async () => {
  const { db, order, deps } = await setup();
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id)));
  expect(await handleStripeEvent(deps, ev("evt_2", "charge.refunded", { payment_intent: "pi_1", refunded: false, amount_refunded: 500 }))).toBe("ignored");
  expect((await getOrderById(db, order.id))!.status).toBe("paid");
  expect((await entitlements(db))[0].revoked_at).toBeNull();
});

test("email failure still marks the order paid", async () => {
  const { db, mailer, order, deps } = await setup();
  mailer.fail = true;
  expect(await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(order.id)))).toBe("processed");
  expect((await getOrderById(db, order.id))!.status).toBe("paid");
});

test("a second purchase by the same email reuses the customer", async () => {
  const { db, deps } = await setup();
  const o2 = await createPendingOrder(db, { lines: [{ productId: "p1", title: "One", slug: "p1", priceCents: 1900 }], subtotalCents: 1900, now: deps.now() });
  const [o1] = (await db.prepare("SELECT id FROM orders ORDER BY rowid").all<any>()).results;
  await handleStripeEvent(deps, ev("evt_1", "checkout.session.completed", session(o1.id)));
  await handleStripeEvent(deps, ev("evt_2", "checkout.session.completed", session(o2.id, { id: "cs_2", payment_intent: "pi_2", customer_details: { email: "buyer@example.com" } })));
  expect(await db.prepare("SELECT COUNT(*) AS n FROM customers").first("n")).toBe(1);
});
