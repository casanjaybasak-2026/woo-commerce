const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const MAX_PRICE_CENTS = 99_999_999; // $999,999.99

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

/** Parses an admin-entered dollar amount ("19.99", "$5", "1,250") into integer cents. */
export function parseUsdToCents(input: string): number {
  const s = String(input).trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`Invalid amount: "${input}"`);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (cents > MAX_PRICE_CENTS) throw new RangeError("Amount too large");
  return cents;
}
