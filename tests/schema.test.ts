import { createTestDb } from "./helpers/d1";

test("migrations create all tables", async () => {
  const db = await createTestDb();
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual(
    expect.arrayContaining([
      "products", "product_files", "customers", "orders", "order_items", "entitlements",
      "login_tokens", "sessions", "download_events", "stripe_events",
    ]),
  );
});

test("rejects unknown order status", async () => {
  const db = await createTestDb();
  await expect(
    db.prepare(
      "INSERT INTO orders (id, public_id, customer_email, status, subtotal_cents, discount_cents, total_cents, currency, created_at) VALUES ('o','p','a@b.c','bogus',0,0,0,'usd','x')",
    ).run(),
  ).rejects.toThrow();
});
