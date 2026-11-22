import { createTestDb } from "../helpers/d1";
import { seedProduct, clock } from "../helpers/fakes";
import {
  saveProduct, listPublished, getProductBySlug, getProductsByIds, deleteProduct,
  listAllProducts, listCategories, addFile, listFiles, archiveFile, removeFile,
} from "../../src/lib/db/products";

const input = (title: string, extra = {}) => ({
  title, category: "Templates", shortDesc: "Short", longDescMd: "", priceCents: 1900,
  compareAtCents: null, coverKey: null, published: true, sort: 0, ...extra,
});

test("saveProduct generates unique slugs and updates in place", async () => {
  const db = await createTestDb();
  const now = clock();
  const a = await saveProduct(db, input("Planner"), now());
  const b = await saveProduct(db, input("Planner"), now());
  expect(a.slug).toBe("planner");
  expect(b.slug).toBe("planner-2");
  const a2 = await saveProduct(db, { ...input("Planner Pro"), id: a.id, slug: a.slug }, now());
  expect(a2).toMatchObject({ id: a.id, slug: "planner", title: "Planner Pro" });
});

test("listPublished hides unpublished and deleted", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1" });
  await seedProduct(db, { id: "p2", published: false });
  await seedProduct(db, { id: "p3", deletedAt: "2026-11-02" });
  expect((await listPublished(db)).map((p) => p.id)).toEqual(["p1"]);
});

test("listPublished filters by category and q, case-insensitive", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1", title: "Budget Planner", category: "Finance" });
  await seedProduct(db, { id: "p2", title: "Recipe Book", category: "Food", shortDesc: "Easy BUDGET meals" });
  await seedProduct(db, { id: "p3", title: "100%_off guide", category: "Finance" });
  expect((await listPublished(db, { q: "budget" })).map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  expect((await listPublished(db, { category: "Finance" })).map((p) => p.id).sort()).toEqual(["p1", "p3"]);
  expect((await listPublished(db, { q: "%_" })).map((p) => p.id)).toEqual(["p3"]);
});

test("listPublished sorts by price and newest", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "a", priceCents: 900, createdAt: "2026-11-03T00:00:00.000Z" });
  await seedProduct(db, { id: "b", priceCents: 100, createdAt: "2026-11-01T00:00:00.000Z" });
  await seedProduct(db, { id: "c", priceCents: 500, createdAt: "2026-11-02T00:00:00.000Z" });
  expect((await listPublished(db, { sort: "price_asc" })).map((p) => p.id)).toEqual(["b", "c", "a"]);
  expect((await listPublished(db, { sort: "price_desc" })).map((p) => p.id)).toEqual(["a", "c", "b"]);
  expect((await listPublished(db, { sort: "newest" })).map((p) => p.id)).toEqual(["a", "c", "b"]);
});

test("getProductBySlug only returns live products; getProductsByIds returns all", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1", slug: "one" });
  await seedProduct(db, { id: "p2", slug: "two", published: false });
  expect((await getProductBySlug(db, "one"))?.id).toBe("p1");
  expect(await getProductBySlug(db, "two")).toBeNull();
  expect((await getProductsByIds(db, ["p1", "p2", "nope"])).map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  expect(await getProductsByIds(db, [])).toEqual([]);
});

test("deleteProduct hard-deletes when no orders", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1" });
  expect(await deleteProduct(db, "p1", clock()())).toBe("deleted");
  expect(await getProductsByIds(db, ["p1"])).toEqual([]);
});

test("deleteProduct soft-deletes when orders exist", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1", slug: "one" });
  await db.prepare("INSERT INTO orders (id, public_id, status, subtotal_cents, total_cents, created_at) VALUES ('o1','pub','pending',1900,1900,'x')").run();
  await db.prepare("INSERT INTO order_items (id, order_id, product_id, title_snapshot, price_cents_snapshot) VALUES ('i1','o1','p1','One',1900)").run();
  expect(await deleteProduct(db, "p1", clock()())).toBe("soft-deleted");
  expect(await getProductBySlug(db, "one")).toBeNull();
  const [p] = await getProductsByIds(db, ["p1"]);
  expect(p.deletedAt).toBeTruthy();
  expect(await listAllProducts(db)).toEqual([]);
});

test("listCategories returns distinct live categories", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "a", category: "Finance" });
  await seedProduct(db, { id: "b", category: "Finance" });
  await seedProduct(db, { id: "c", category: "Food" });
  await seedProduct(db, { id: "d", category: "Hidden", published: false });
  expect(await listCategories(db)).toEqual(["Finance", "Food"]);
});

test("files: add, list (hiding archived by default), archive, remove", async () => {
  const db = await createTestDb();
  await seedProduct(db, { id: "p1" });
  const f = await addFile(db, { productId: "p1", r2Key: "products/p1/x.pdf", displayName: "x.pdf", sizeBytes: 10, contentType: "application/pdf" }, clock()());
  expect((await listFiles(db, "p1")).map((x) => x.id)).toEqual([f.id]);
  await archiveFile(db, f.id, clock()());
  expect(await listFiles(db, "p1")).toEqual([]);
  expect((await listFiles(db, "p1", { includeArchived: true }))[0].archivedAt).toBeTruthy();
  expect((await removeFile(db, f.id))?.r2Key).toBe("products/p1/x.pdf");
  expect(await listFiles(db, "p1", { includeArchived: true })).toEqual([]);
});
