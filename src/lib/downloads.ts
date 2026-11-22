import { getFile, rowToFile, rowToProduct } from "./db/products";
import type { Product, ProductFile } from "./types";

export const DOWNLOAD_LIMIT = 20;
const WINDOW_MS = 24 * 3_600_000;

export type DownloadDecision =
  | { ok: true; file: ProductFile }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ENTITLED" | "RATE_LIMITED" };

/** Checks ownership and the rolling 24h limit; records the download when allowed. */
export async function authorizeDownload(
  deps: { db: D1Database; now: () => Date },
  customerId: string,
  fileId: string,
): Promise<DownloadDecision> {
  const { db } = deps;
  const now = deps.now();
  const file = await getFile(db, fileId);
  if (!file) return { ok: false, reason: "NOT_FOUND" };

  const ent = await db
    .prepare("SELECT id FROM entitlements WHERE customer_id = ? AND product_id = ? AND revoked_at IS NULL ORDER BY created_at LIMIT 1")
    .bind(customerId, file.productId)
    .first<{ id: string }>();
  if (!ent) return { ok: false, reason: "NOT_ENTITLED" };

  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const count = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM download_events d JOIN entitlements e ON e.id = d.entitlement_id
       WHERE e.customer_id = ? AND d.file_id = ? AND d.at > ?`,
    )
    .bind(customerId, fileId, since)
    .first<number>("n");
  if (Number(count) >= DOWNLOAD_LIMIT) return { ok: false, reason: "RATE_LIMITED" };

  await db
    .prepare("INSERT INTO download_events (id, entitlement_id, file_id, at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), ent.id, fileId, now.toISOString())
    .run();
  return { ok: true, file };
}

export interface LibraryEntry {
  product: Product;
  files: ProductFile[];
  purchasedAt: string;
}

/** Products the customer currently owns (including archived files and soft-deleted products). */
export async function listLibrary(db: D1Database, customerId: string): Promise<LibraryEntry[]> {
  const { results: prows } = await db
    .prepare(
      `SELECT p.*, MIN(e.created_at) AS purchased_at FROM entitlements e JOIN products p ON p.id = e.product_id
       WHERE e.customer_id = ? AND e.revoked_at IS NULL GROUP BY p.id ORDER BY purchased_at DESC`,
    )
    .bind(customerId)
    .all<any>();
  if (prows.length === 0) return [];
  const ids = prows.map((r) => r.id);
  const { results: frows } = await db
    .prepare(`SELECT * FROM product_files WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at, display_name`)
    .bind(...ids)
    .all<any>();
  const files = frows.map(rowToFile);
  return prows.map((r) => ({
    product: rowToProduct(r),
    files: files.filter((f) => f.productId === r.id),
    purchasedAt: r.purchased_at,
  }));
}
