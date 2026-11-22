import { slugify } from "../slug";
import type { Product, ProductFile } from "../types";

type Row = Record<string, any>;

export function rowToProduct(r: Row): Product {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category ?? null,
    shortDesc: r.short_desc ?? "",
    longDescMd: r.long_desc_md ?? "",
    priceCents: Number(r.price_cents),
    compareAtCents: r.compare_at_cents == null ? null : Number(r.compare_at_cents),
    coverKey: r.cover_key ?? null,
    published: Boolean(r.published),
    sort: Number(r.sort ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at ?? null,
  };
}

export function rowToFile(r: Row): ProductFile {
  return {
    id: r.id,
    productId: r.product_id,
    r2Key: r.r2_key,
    displayName: r.display_name,
    sizeBytes: Number(r.size_bytes),
    contentType: r.content_type,
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? null,
  };
}

export type SortKey = "newest" | "price_asc" | "price_desc";

const ORDER_BY: Record<SortKey | "default", string> = {
  default: "sort ASC, created_at DESC",
  newest: "created_at DESC",
  price_asc: "price_cents ASC, created_at DESC",
  price_desc: "price_cents DESC, created_at DESC",
};

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function listPublished(
  db: D1Database,
  opts: { category?: string; q?: string; sort?: SortKey } = {},
): Promise<Product[]> {
  const where = ["published = 1", "deleted_at IS NULL"];
  const params: unknown[] = [];
  if (opts.category) {
    where.push("category = ?");
    params.push(opts.category);
  }
  const q = opts.q?.trim();
  if (q) {
    where.push("(title LIKE ? ESCAPE '\\' OR short_desc LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(q)}%`;
    params.push(like, like);
  }
  const order = ORDER_BY[opts.sort ?? "default"] ?? ORDER_BY.default;
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 500`)
    .bind(...params)
    .all<Row>();
  return results.map(rowToProduct);
}

export async function getProductBySlug(db: D1Database, slug: string): Promise<Product | null> {
  const r = await db
    .prepare("SELECT * FROM products WHERE slug = ? AND published = 1 AND deleted_at IS NULL")
    .bind(slug)
    .first<Row>();
  return r ? rowToProduct(r) : null;
}

export async function getProductById(db: D1Database, id: string): Promise<Product | null> {
  const r = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<Row>();
  return r ? rowToProduct(r) : null;
}

/** Returns products regardless of published/deleted state; callers decide what to do with them. */
export async function getProductsByIds(db: D1Database, ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<Row>();
  return results.map(rowToProduct);
}

export async function listAllProducts(db: D1Database): Promise<Product[]> {
  const { results } = await db
    .prepare("SELECT * FROM products WHERE deleted_at IS NULL ORDER BY sort ASC, created_at DESC")
    .all<Row>();
  return results.map(rowToProduct);
}

export async function listCategories(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT DISTINCT category FROM products WHERE published = 1 AND deleted_at IS NULL AND category IS NOT NULL AND category != '' ORDER BY category",
    )
    .all<{ category: string }>();
  return results.map((r) => r.category);
}

export interface ProductInput {
  id?: string;
  /** Id to use when inserting (lets callers key R2 objects before the row exists). */
  newId?: string;
  slug?: string;
  title: string;
  category: string | null;
  shortDesc: string;
  longDescMd: string;
  priceCents: number;
  compareAtCents: number | null;
  coverKey: string | null;
  published: boolean;
  sort: number;
}

async function uniqueSlug(db: D1Database, base: string, exceptId?: string): Promise<string> {
  let candidate = base;
  for (let n = 2; ; n++) {
    const hit = await db
      .prepare("SELECT id FROM products WHERE slug = ? AND id != ?")
      .bind(candidate, exceptId ?? "")
      .first<{ id: string }>();
    if (!hit) return candidate;
    candidate = `${base}-${n}`;
  }
}

export async function saveProduct(db: D1Database, input: ProductInput, now: Date): Promise<Product> {
  const ts = now.toISOString();
  const id = input.id ?? input.newId ?? crypto.randomUUID();
  const slug = await uniqueSlug(db, slugify(input.slug?.trim() || input.title), input.id);
  const fields = [
    slug, input.title.trim(), input.category?.trim() || null, input.shortDesc, input.longDescMd,
    input.priceCents, input.compareAtCents, input.coverKey, input.published ? 1 : 0, input.sort,
  ];
  if (input.id) {
    await db
      .prepare(
        `UPDATE products SET slug=?, title=?, category=?, short_desc=?, long_desc_md=?, price_cents=?,
         compare_at_cents=?, cover_key=?, published=?, sort=?, updated_at=? WHERE id=?`,
      )
      .bind(...fields, ts, id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO products (slug, title, category, short_desc, long_desc_md, price_cents, compare_at_cents,
         cover_key, published, sort, created_at, updated_at, id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(...fields, ts, ts, id)
      .run();
  }
  return (await getProductById(db, id))!;
}

async function hasOrders(db: D1Database, productId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM order_items WHERE product_id = ? LIMIT 1").bind(productId).first());
}

export async function deleteProduct(db: D1Database, id: string, now: Date): Promise<"deleted" | "soft-deleted"> {
  if (await hasOrders(db, id)) {
    await db
      .prepare("UPDATE products SET deleted_at = ?, published = 0, updated_at = ? WHERE id = ?")
      .bind(now.toISOString(), now.toISOString(), id)
      .run();
    return "soft-deleted";
  }
  await db.batch([
    db.prepare("DELETE FROM product_files WHERE product_id = ?").bind(id),
    db.prepare("DELETE FROM products WHERE id = ?").bind(id),
  ]);
  return "deleted";
}

export async function listFiles(
  db: D1Database,
  productId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ProductFile[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM product_files WHERE product_id = ? ${opts.includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY created_at, display_name`,
    )
    .bind(productId)
    .all<Row>();
  return results.map(rowToFile);
}

export async function getFile(db: D1Database, fileId: string): Promise<ProductFile | null> {
  const r = await db.prepare("SELECT * FROM product_files WHERE id = ?").bind(fileId).first<Row>();
  return r ? rowToFile(r) : null;
}

export async function addFile(
  db: D1Database,
  f: Pick<ProductFile, "productId" | "r2Key" | "displayName" | "sizeBytes" | "contentType">,
  now: Date,
): Promise<ProductFile> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO product_files (id, product_id, r2_key, display_name, size_bytes, content_type, created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(id, f.productId, f.r2Key, f.displayName, f.sizeBytes, f.contentType, now.toISOString())
    .run();
  return (await getFile(db, id))!;
}

/** Hides a file from the listing but keeps it downloadable for existing buyers. */
export async function archiveFile(db: D1Database, fileId: string, now: Date): Promise<void> {
  await db.prepare("UPDATE product_files SET archived_at = ? WHERE id = ?").bind(now.toISOString(), fileId).run();
}

/** Deletes the file row; returns it so the caller can delete the R2 object. */
export async function removeFile(db: D1Database, fileId: string): Promise<ProductFile | null> {
  const f = await getFile(db, fileId);
  if (!f) return null;
  await db.prepare("DELETE FROM product_files WHERE id = ?").bind(fileId).run();
  return f;
}

export { hasOrders as productHasOrders };
