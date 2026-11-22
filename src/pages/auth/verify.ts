import type { APIRoute } from "astro";
import { verifyLogin } from "../../lib/auth/login";
import { sessionCookie } from "../../lib/auth/session";
import { getEnv } from "../../lib/env";
import { now } from "../../lib/services";

// GET from the email link. Mail scanners may prefetch links; tokens are single-use, so on failure users can request another.
export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token") ?? "";
  const session = await verifyLogin({ db: getEnv().DB, now }, token);
  if (!session) return new Response(null, { status: 303, headers: { Location: "/account/login?error=expired", "Cache-Control": "no-store" } });
  return new Response(null, {
    status: 303,
    headers: { Location: "/library", "Set-Cookie": sessionCookie(session.sessionToken, session.expiresAt), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
};
