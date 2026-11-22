import type { APIRoute } from "astro";
import { getEnv } from "../../lib/env";

// Public route for product cover images only. Deliverable files are never served here.
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? "";
  if (!key.startsWith("covers/") || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await getEnv().FILES.get(key, { onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
};
