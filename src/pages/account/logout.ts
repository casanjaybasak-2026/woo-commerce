import type { APIRoute } from "astro";
import { clearSessionCookie, destroySession, SESSION_COOKIE } from "../../lib/auth/session";
import { getEnv } from "../../lib/env";

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(getEnv().DB, token);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": clearSessionCookie() } });
};
