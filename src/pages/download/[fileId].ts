import type { APIRoute } from "astro";
import { authorizeDownload } from "../../lib/downloads";
import { getEnv } from "../../lib/env";
import { now } from "../../lib/services";

function page(status: number, title: string, text: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 1rem;color:#1f2937;line-height:1.6">
<h1 style="font-size:1.5rem">${title}</h1><p>${text}</p><p><a href="/library" style="color:#2f5bea">Back to my Library</a></p></body>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.customer) return new Response(null, { status: 302, headers: { Location: "/account/login" } });
  const env = getEnv();
  const decision = await authorizeDownload({ db: env.DB, now }, locals.customer.id, params.fileId ?? "");
  if (!decision.ok) {
    if (decision.reason === "RATE_LIMITED")
      return page(429, "Download limit reached", "You've downloaded this file many times in the last 24 hours. Please try again later, or contact us if you need help.");
    return page(404, "File not found", "This file isn't in your Library.");
  }
  const obj = await env.FILES.get(decision.file.r2Key);
  if (!obj) {
    console.error(`[download] missing R2 object ${decision.file.r2Key}`);
    return page(404, "File unavailable", "This file is temporarily unavailable. Please contact us and we'll sort it out.");
  }
  const name = decision.file.displayName;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(obj.body, {
    headers: {
      "Content-Type": decision.file.contentType || "application/octet-stream",
      "Content-Length": String(obj.size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
