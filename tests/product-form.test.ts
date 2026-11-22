import { parseProductForm, safeFileName } from "../src/lib/admin/product-form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("valid form", () => {
  const r = parseProductForm(fd({ title: " Budget Planner ", price: "19", compareAt: "29.00", category: "Finance", shortDesc: "s", longDescMd: "# x", published: "on", sort: "2", slug: "" }));
  expect(r).toEqual({ ok: true, value: { title: "Budget Planner", slug: undefined, category: "Finance", shortDesc: "s", longDescMd: "# x", priceCents: 1900, compareAtCents: 2900, published: true, sort: 2 } });
});

test("errors are per field", () => {
  const r = parseProductForm(fd({ title: "", price: "abc", compareAt: "5" }));
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.errors.title).toBeTruthy();
    expect(r.errors.price).toBeTruthy();
  }
});

test("price must be at least $0.50 and compare-at above price", () => {
  const r = parseProductForm(fd({ title: "T", price: "0.40" }));
  expect(!r.ok && r.errors.price).toMatch(/0\.50/);
  const r2 = parseProductForm(fd({ title: "T", price: "10", compareAt: "9" }));
  expect(!r2.ok && r2.errors.compareAt).toBeTruthy();
});

test("unchecked published and empty compare-at", () => {
  const r = parseProductForm(fd({ title: "T", price: "1" }));
  expect(r.ok && r.value).toMatchObject({ published: false, compareAtCents: null, sort: 0, category: null });
});

test("safeFileName", () => {
  expect(safeFileName("../../My Guide (v2).pdf")).toBe("My-Guide-v2.pdf");
  expect(safeFileName("")).toBe("file");
});
