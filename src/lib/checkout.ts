import { normalizeCart, priceCart } from "./cart";
import { createPendingOrder, setStripeSession } from "./db/orders";
import { getProductsByIds } from "./db/products";
import type { CheckoutSessionParams, PaymentGateway } from "./payments";
import type { CartLine } from "./types";

export const STRIPE_MIN_CENTS = 50;

export class CheckoutError extends Error {
  constructor(public code: "EMPTY_CART" | "NO_VALID_ITEMS" | "BELOW_MINIMUM") {
    super(code);
    this.name = "CheckoutError";
  }
}

export function buildSessionParams(
  order: { id: string; publicId: string },
  lines: CartLine[],
  siteUrl: string,
  opts: { automaticTax: boolean },
): CheckoutSessionParams {
  const base = siteUrl.replace(/\/$/, "");
  const params: CheckoutSessionParams = {
    mode: "payment",
    line_items: lines.map((l) => ({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: l.priceCents, product_data: { name: l.title, metadata: { product_id: l.productId } } },
    })),
    success_url: `${base}/checkout/success?order=${encodeURIComponent(order.publicId)}`,
    cancel_url: `${base}/cart`,
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    allow_promotion_codes: true,
  };
  if (opts.automaticTax) params.automatic_tax = { enabled: true };
  return params;
}

/** Prices the cart from the database, records a pending order and opens a Stripe Checkout session. */
export async function startCheckout(
  deps: { db: D1Database; gateway: PaymentGateway; siteUrl: string; automaticTax: boolean; now: () => Date },
  rawCart: unknown,
): Promise<{ url: string; publicId: string }> {
  const ids = normalizeCart(rawCart);
  if (ids.length === 0) throw new CheckoutError("EMPTY_CART");
  const { lines, subtotalCents } = priceCart(ids, await getProductsByIds(deps.db, ids));
  if (lines.length === 0) throw new CheckoutError("NO_VALID_ITEMS");
  if (subtotalCents < STRIPE_MIN_CENTS) throw new CheckoutError("BELOW_MINIMUM");
  const order = await createPendingOrder(deps.db, { lines, subtotalCents, now: deps.now() });
  const session = await deps.gateway.createCheckoutSession(
    buildSessionParams(order, lines, deps.siteUrl, { automaticTax: deps.automaticTax }),
  );
  await setStripeSession(deps.db, order.id, session.id);
  return { url: session.url, publicId: order.publicId };
}
