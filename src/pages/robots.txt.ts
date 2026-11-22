import type { APIRoute } from "astro";
import { siteUrl } from "../lib/services";

export const GET: APIRoute = () =>
  new Response(
    ["User-agent: *", "Disallow: /admin", "Disallow: /api/", "Disallow: /library", "Disallow: /download/", "Disallow: /auth/", "Disallow: /account/", "Disallow: /checkout/", "", `Sitemap: ${siteUrl()}/sitemap.xml`].join("\n"),
    { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } },
  );
