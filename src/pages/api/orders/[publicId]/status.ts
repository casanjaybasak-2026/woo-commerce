import type { APIRoute } from "astro";
import { getOrderByPublicId } from "../../../../lib/db/orders";
import { getEnv } from "../../../../lib/env";
import { json } from "../../../../lib/services";

export const GET: APIRoute = async ({ params }) => {
  const order = await getOrderByPublicId(getEnv().DB, params.publicId ?? "");
  return order ? json({ status: order.status }) : json({ status: "unknown" }, 404);
};
