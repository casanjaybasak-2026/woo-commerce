import { formatUsd, parseUsdToCents } from "../src/lib/money";
import { slugify } from "../src/lib/slug";

test("formatUsd", () => {
  expect(formatUsd(1900)).toBe("$19.00");
  expect(formatUsd(123456)).toBe("$1,234.56");
  expect(formatUsd(0)).toBe("$0.00");
});

test("parseUsdToCents", () => {
  expect(parseUsdToCents("19.99")).toBe(1999);
  expect(parseUsdToCents("$5")).toBe(500);
  expect(parseUsdToCents("0.1")).toBe(10);
  expect(parseUsdToCents(" 1,250.50 ")).toBe(125050);
  expect(() => parseUsdToCents("-1")).toThrow(RangeError);
  expect(() => parseUsdToCents("abc")).toThrow(RangeError);
  expect(() => parseUsdToCents("")).toThrow(RangeError);
  expect(() => parseUsdToCents("1.999")).toThrow(RangeError);
  expect(() => parseUsdToCents("1000000")).toThrow(RangeError);
  expect(parseUsdToCents("999999.99")).toBe(99999999);
});

test("slugify", () => {
  expect(slugify("  Notion Budget Planner — 2027! ")).toBe("notion-budget-planner-2027");
  expect(slugify("Café Recipes")).toBe("cafe-recipes");
  expect(slugify("!!!")).toBe("item");
});
