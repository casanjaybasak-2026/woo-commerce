import type { APIRoute } from "astro";
import { normalizeCart, priceCart } from "../../lib/cart";
import { getProductsByIds } from "../../lib/db/products";
import { getEnv } from "../../lib/env";
import { json } from "../../lib/services";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const ids = normalizeCart((body as { ids?: unknown }).ids);
  return json(priceCart(ids, await getProductsByIds(getEnv().DB, ids)));
};
