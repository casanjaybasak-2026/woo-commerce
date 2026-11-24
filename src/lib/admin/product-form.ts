import { STRIPE_MIN_CENTS } from "../checkout";
import { parseUsdToCents } from "../money";

export interface ProductFormValue {
  title: string;
  slug: string | undefined;
  category: string | null;
  shortDesc: string;
  longDescMd: string;
  priceCents: number;
  compareAtCents: number | null;
  published: boolean;
  sort: number;
}

export type ProductFormResult = { ok: true; value: ProductFormValue } | { ok: false; errors: Record<string, string> };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export function parseProductForm(f: FormData): ProductFormResult {
  const errors: Record<string, string> = {};
  const title = str(f, "title");
  if (!title) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";

  let priceCents = 0;
  try {
    priceCents = parseUsdToCents(str(f, "price"));
    if (priceCents < STRIPE_MIN_CENTS) errors.price = "Price must be at least $0.50 (Stripe's minimum).";
  } catch {
    errors.price = "Enter a price like 19 or 19.99.";
  }

  let compareAtCents: number | null = null;
  const compareRaw = str(f, "compareAt");
  if (compareRaw) {
    try {
      compareAtCents = parseUsdToCents(compareRaw);
      if (!errors.price && compareAtCents <= priceCents) errors.compareAt = "Compare-at price must be higher than the price (or leave it empty).";
    } catch {
      errors.compareAt = "Enter a price like 29 or 29.99, or leave it empty.";
    }
  }

  const shortDesc = str(f, "shortDesc");
  if (shortDesc.length > 300) errors.shortDesc = "Keep the short description under 300 characters.";
  const sort = Number.parseInt(str(f, "sort") || "0", 10);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      slug: str(f, "slug") || undefined,
      category: str(f, "category") || null,
      shortDesc,
      longDescMd: String(f.get("longDescMd") ?? ""),
      priceCents,
      compareAtCents,
      published: f.get("published") === "on",
      sort: Number.isFinite(sort) ? sort : 0,
    },
  };
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 120);
  return cleaned || "file";
}

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export { MAX_FILE_BYTES as MAX_UPLOAD_BYTES } from "../storage";
