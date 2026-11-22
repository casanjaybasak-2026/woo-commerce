import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

type AccessEnv = {
  ADMIN_EMAILS: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ENVIRONMENT: string;
  DEV_ADMIN_BYPASS?: string;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteJwks(team: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksCache.set(team, jwks);
  }
  return jwks;
}

export function adminEmailList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Verifies the Cloudflare Access JWT on a request (defence in depth on top of the Access policy).
 * Returns the admin's email, or null.
 */
export async function verifyAdmin(request: Request, env: AccessEnv, keyResolver?: JWTVerifyGetKey): Promise<{ email: string } | null> {
  if (env.DEV_ADMIN_BYPASS === "true" && env.ENVIRONMENT !== "production") return { email: "dev@localhost" };

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const team = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!token || !team || !env.CF_ACCESS_AUD) return null;
  try {
    const { payload } = await jwtVerify(token, keyResolver ?? remoteJwks(team), {
      issuer: `https://${team}`,
      audience: env.CF_ACCESS_AUD,
    });
    const email = String(payload.email ?? "").toLowerCase();
    return email && adminEmailList(env.ADMIN_EMAILS).includes(email) ? { email } : null;
  } catch {
    return null;
  }
}
