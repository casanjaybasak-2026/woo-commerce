import type { APIRoute } from "astro";
import { getEnv } from "../../../lib/env";
import { gateway, json, mailer, now, siteUrl } from "../../../lib/services";
import { handleStripeEvent } from "../../../lib/webhook";

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing signature" }, 400);
  const raw = await request.text();
  let event;
  try {
    event = await gateway(env).constructEvent(raw, signature);
  } catch (err) {
    console.warn("[webhook] signature verification failed", (err as Error).message);
    return json({ error: "invalid signature" }, 400);
  }
  try {
    const result = await handleStripeEvent(
      { db: env.DB, mailer: mailer(env), siteUrl: siteUrl(env), storeName: env.STORE_NAME, now },
      event,
    );
    return json({ received: true, result });
  } catch (err) {
    console.error(`[webhook] error handling ${event.type} ${event.id}`, err);
    return json({ error: "processing failed" }, 500); // Stripe will retry
  }
};
