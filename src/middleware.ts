import { defineMiddleware } from "astro:middleware";
import { verifyAdmin } from "./lib/admin/access";
import { getSessionCustomer, SESSION_COOKIE } from "./lib/auth/session";
import { getEnv } from "./lib/env";

const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/") || p.startsWith("/api/admin");

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = getEnv();
  const path = ctx.url.pathname;
  ctx.locals.customer = null;
  ctx.locals.adminEmail = null;

  if (isAdminPath(path)) {
    const admin = await verifyAdmin(ctx.request, env);
    if (!admin) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    ctx.locals.adminEmail = admin.email;
    const res = await next();
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  }

  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (token) ctx.locals.customer = await getSessionCustomer(env.DB, token, new Date());

  const res = await next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!res.headers.has("X-Frame-Options")) res.headers.set("X-Frame-Options", "DENY");
  return res;
});
