import { createTestDb } from "./helpers/d1";
import { FakeGateway, clock, seedProduct } from "./helpers/fakes";
import { buildSessionParams, startCheckout, CheckoutError } from "../src/lib/checkout";
import { getOrderByPublicId, listOrderItems } from "../src/lib/db/orders";

test("buildSessionParams", () => {
  const p = buildSessionParams({ id: "o1", publicId: "pub1" }, [{ productId: "p1", title: "One", slug: "one", priceCents: 1900 }], "https://s.test/", { automaticTax: false });
  expect(p).toMatchObject({
    mode: "payment",
    allow_promotion_codes: true,
    client_reference_id: "o1",
    metadata: { order_id: "o1" },
    success_url: "https://s.test/checkout/success?order=pub1",
    cancel_url: "https://s.test/cart",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 1900, product_data: { name: "One", metadata: { product_id: "p1" } } } }],
  });
  expect(p.automatic_tax).toBeUndefined();
  expect(buildSessionParams({ id: "o1", publicId: "p" }, [], "https://s.test", { automaticTax: true }).automatic_tax).toEqual({ enabled: true });
});

async function setup() {
  const db = await createTestDb();
  const gateway = new FakeGateway();
  const deps = { db, gateway, siteUrl: "https://s.test", automaticTax: false, now: clock() };
  return { db, gateway, deps };
}

test("startCheckout uses DB price, ignores client price, drops unpublished", async () => {
  const { db, gateway, deps } = await setup();
  await seedProduct(db, { id: "p1", title: "One", priceCents: 1900 });
  await seedProduct(db, { id: "p2", published: false });
  const r = await startCheckout(deps, ["p1", "p2", { id: "p1", price: 1 }]);
  expect(r.url).toBe("https://checkout.stripe.test/1");
  expect(gateway.sessions[0].line_items).toHaveLength(1);
  expect(gateway.sessions[0].line_items[0].price_data.unit_amount).toBe(1900);
  const order = await getOrderByPublicId(db, r.publicId);
  expect(order).toMatchObject({ status: "pending", subtotalCents: 1900, totalCents: 1900, stripeSessionId: "cs_test_1", currency: "usd" });
  expect(await listOrderItems(db, order!.id)).toMatchObject([{ productId: "p1", titleSnapshot: "One", priceCentsSnapshot: 1900 }]);
});

test("startCheckout rejects empty cart", async () => {
  const { deps } = await setup();
  await expect(startCheckout(deps, [])).rejects.toMatchObject({ code: "EMPTY_CART" });
  await expect(startCheckout(deps, "junk")).rejects.toBeInstanceOf(CheckoutError);
});

test("startCheckout rejects cart with only invalid items, creating no order", async () => {
  const { db, deps } = await setup();
  await seedProduct(db, { id: "p2", published: false });
  await expect(startCheckout(deps, ["p2", "zzz"])).rejects.toMatchObject({ code: "NO_VALID_ITEMS" });
  expect(await db.prepare("SELECT COUNT(*) AS n FROM orders").first("n")).toBe(0);
});

test("startCheckout rejects totals below Stripe's $0.50 minimum", async () => {
  const { db, deps } = await setup();
  await seedProduct(db, { id: "cheap", priceCents: 30 });
  await expect(startCheckout(deps, ["cheap"])).rejects.toMatchObject({ code: "BELOW_MINIMUM" });
});
