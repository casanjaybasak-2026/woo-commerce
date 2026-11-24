import type { APIRoute } from "astro";
import { files } from "../../lib/services";

// Public route for product cover images only. Deliverable files are never served here.
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? "";
  if (!key.startsWith("covers/") || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await files().get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.contentType.startsWith("image/") ? obj.contentType : "application/octet-stream",
      "Content-Length": String(obj.size),
      // Cover keys include a random id, so a new upload always gets a new URL.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
