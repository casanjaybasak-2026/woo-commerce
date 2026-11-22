import type { APIRoute } from "astro";
import { CheckoutError, startCheckout } from "../../lib/checkout";
import { getEnv } from "../../lib/env";
import { gateway, json, now, siteUrl } from "../../lib/services";

const MESSAGES: Record<CheckoutError["code"], string> = {
  EMPTY_CART: "Your cart is empty.",
  NO_VALID_ITEMS: "These items are no longer available.",
  BELOW_MINIMUM: "The order total is below the minimum card payment of $0.50.",
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  try {
    const r = await startCheckout(
      { db: env.DB, gateway: gateway(env), siteUrl: siteUrl(env), automaticTax: env.STRIPE_AUTOMATIC_TAX === "true", now },
      (body as { ids?: unknown }).ids,
    );
    return json({ url: r.url });
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.code, message: MESSAGES[err.code] }, 400);
    console.error("[checkout] failed", err);
    return json({ error: "CHECKOUT_FAILED", message: "Checkout is unavailable right now. Please try again in a moment." }, 502);
  }
};
