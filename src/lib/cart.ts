import type { CartLine, Product } from "./types";

export const MAX_CART_ITEMS = 50;

/** Turns untrusted client input into a clean list of unique product ids. */
export function normalizeCart(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id.length > 64 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_CART_ITEMS) break;
  }
  return out;
}

export function isPurchasable(p: Product): boolean {
  return p.published && !p.deletedAt;
}

/** Prices a cart from trusted product records. Unknown, unpublished or deleted ids are reported in `missing`. */
export function priceCart(ids: string[], products: Product[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p && isPurchasable(p)) lines.push({ productId: p.id, title: p.title, slug: p.slug, priceCents: p.priceCents });
    else missing.push(id);
  }
  return { lines, subtotalCents: lines.reduce((s, l) => s + l.priceCents, 0), missing };
}
