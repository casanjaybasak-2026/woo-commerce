import type { APIRoute } from "astro";
import { listPublished } from "../lib/db/products";
import { getEnv } from "../lib/env";
import { siteUrl } from "../lib/services";

export const GET: APIRoute = async () => {
  const env = getEnv();
  const base = siteUrl(env);
  const products = await listPublished(env.DB);
  const pages = ["/", "/shop", "/about", "/contact", "/terms", "/privacy", "/refund-policy"];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = [
    ...pages.map((p) => `<url><loc>${esc(base + p)}</loc></url>`),
    ...products.map((p) => `<url><loc>${esc(`${base}/p/${encodeURIComponent(p.slug)}`)}</loc><lastmod>${p.updatedAt.slice(0, 10)}</lastmod></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
  });
};
