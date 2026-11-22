import { normalizeCart, priceCart } from "../src/lib/cart";
import type { Product } from "../src/lib/types";

const base: Product = {
  id: "p1", slug: "one", title: "One", category: null, shortDesc: "", longDescMd: "",
  priceCents: 1900, compareAtCents: null, coverKey: null, published: true, sort: 0,
  createdAt: "", updatedAt: "", deletedAt: null,
};

test("normalizeCart dedupes, trims, drops non-strings, caps at 50", () => {
  expect(normalizeCart(["a", "a", " b ", 3, null, ""])).toEqual(["a", "b"]);
  expect(normalizeCart("nope")).toEqual([]);
  expect(normalizeCart(undefined)).toEqual([]);
  expect(normalizeCart(Array.from({ length: 60 }, (_, i) => "p" + i))).toHaveLength(50);
});

test("priceCart keeps only published, non-deleted products and reports the rest", () => {
  const products: Product[] = [
    base,
    { ...base, id: "p2", published: false },
    { ...base, id: "p3", deletedAt: "2026-01-01" },
  ];
  expect(priceCart(["p1", "p2", "p3", "p4"], products)).toEqual({
    lines: [{ productId: "p1", title: "One", slug: "one", priceCents: 1900 }],
    subtotalCents: 1900,
    missing: ["p2", "p3", "p4"],
  });
});

test("priceCart keeps input order and sums", () => {
  const products: Product[] = [base, { ...base, id: "p2", slug: "two", title: "Two", priceCents: 500 }];
  const r = priceCart(["p2", "p1"], products);
  expect(r.lines.map((l) => l.productId)).toEqual(["p2", "p1"]);
  expect(r.subtotalCents).toBe(2400);
});
