import { createTestDb } from "./helpers/d1";
import { clock, seedFile, seedProduct, HOUR, MIN } from "./helpers/fakes";
import { authorizeDownload, listLibrary, DOWNLOAD_LIMIT } from "../src/lib/downloads";

async function setup() {
  const db = await createTestDb();
  const now = clock();
  await seedProduct(db, { id: "p1", title: "One" });
  await seedFile(db, "f1", "p1");
  await db.prepare("INSERT INTO customers (id, email, created_at) VALUES ('c1','a@b.co','x'), ('c2','z@b.co','x')").run();
  await db.prepare("INSERT INTO orders (id, public_id, status, subtotal_cents, total_cents, created_at, paid_at) VALUES ('o1','pub','paid',1900,1900,'x','2026-11-20T00:00:00.000Z')").run();
  await db.prepare("INSERT INTO entitlements (id, customer_id, product_id, order_id, created_at) VALUES ('e1','c1','p1','o1','2026-11-20T00:00:00.000Z')").run();
  return { db, now, deps: { db, now } };
}

test("entitled buyer gets the file", async () => {
  const { deps } = await setup();
  const r = await authorizeDownload(deps, "c1", "f1");
  expect(r).toMatchObject({ ok: true, file: { id: "f1", r2Key: "products/p1/f1.pdf" } });
});

test("other customer is NOT_ENTITLED; unknown file is NOT_FOUND", async () => {
  const { deps } = await setup();
  expect(await authorizeDownload(deps, "c2", "f1")).toEqual({ ok: false, reason: "NOT_ENTITLED" });
  expect(await authorizeDownload(deps, "c1", "nope")).toEqual({ ok: false, reason: "NOT_FOUND" });
});

test("revoked entitlement is NOT_ENTITLED", async () => {
  const { db, deps } = await setup();
  await db.prepare("UPDATE entitlements SET revoked_at = 'x'").run();
  expect(await authorizeDownload(deps, "c1", "f1")).toEqual({ ok: false, reason: "NOT_ENTITLED" });
});

test("rate limit: 20 per file per rolling 24h", async () => {
  const { now, deps } = await setup();
  expect(DOWNLOAD_LIMIT).toBe(20);
  for (let i = 0; i < 20; i++) {
    expect((await authorizeDownload(deps, "c1", "f1")).ok).toBe(true);
    now.advance(MIN);
  }
  expect(await authorizeDownload(deps, "c1", "f1")).toEqual({ ok: false, reason: "RATE_LIMITED" });
  now.advance(24 * HOUR);
  expect((await authorizeDownload(deps, "c1", "f1")).ok).toBe(true);
});

test("allows soft-deleted product files for entitled buyers", async () => {
  const { db, deps } = await setup();
  await db.prepare("UPDATE products SET deleted_at = 'x', published = 0").run();
  expect((await authorizeDownload(deps, "c1", "f1")).ok).toBe(true);
});

test("archived file still downloadable by buyer", async () => {
  const { db, deps } = await setup();
  await seedFile(db, "f2", "p1", true);
  expect((await authorizeDownload(deps, "c1", "f2")).ok).toBe(true);
});

test("listLibrary lists active entitlements with files, once per product", async () => {
  const { db } = await setup();
  await seedFile(db, "f2", "p1", true);
  await db.prepare("INSERT INTO orders (id, public_id, status, subtotal_cents, total_cents, created_at) VALUES ('o2','pub2','paid',1900,1900,'x')").run();
  await db.prepare("INSERT INTO entitlements (id, customer_id, product_id, order_id, created_at) VALUES ('e2','c1','p1','o2','2026-11-21T00:00:00.000Z')").run();
  const lib = await listLibrary(db, "c1");
  expect(lib).toHaveLength(1);
  expect(lib[0].product.id).toBe("p1");
  expect(lib[0].files.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
  await db.prepare("UPDATE entitlements SET revoked_at = 'x'").run();
  expect(await listLibrary(db, "c1")).toEqual([]);
});
