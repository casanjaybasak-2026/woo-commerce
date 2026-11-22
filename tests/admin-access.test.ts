import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { verifyAdmin } from "../src/lib/admin/access";

const TEAM = "shelfmade.cloudflareaccess.com";
const AUD = "aud-tag-123";
const env = { ADMIN_EMAILS: "Owner@Example.com, second@example.com", CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD, ENVIRONMENT: "production", DEV_ADMIN_BYPASS: undefined as string | undefined };

let resolver: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, opts?: { aud?: string; exp?: string | number }) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  resolver = (async () => publicKey) as unknown as JWTVerifyGetKey;
  sign = (claims, opts = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256" }).setIssuer(`https://${TEAM}`).setAudience(opts.aud ?? AUD)
      .setIssuedAt().setExpirationTime(opts.exp ?? "1h").sign(privateKey);
});

const req = (jwt?: string) => new Request("https://s.test/admin", { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} });

test("valid JWT with allowed email", async () => {
  expect(await verifyAdmin(req(await sign({ email: "owner@example.com" })), env, resolver)).toEqual({ email: "owner@example.com" });
});

test("email not in ADMIN_EMAILS", async () => {
  expect(await verifyAdmin(req(await sign({ email: "intruder@example.com" })), env, resolver)).toBeNull();
});

test("wrong audience", async () => {
  expect(await verifyAdmin(req(await sign({ email: "owner@example.com" }, { aud: "other" })), env, resolver)).toBeNull();
});

test("expired token", async () => {
  expect(await verifyAdmin(req(await sign({ email: "owner@example.com" }, { exp: Math.floor(Date.now() / 1000) - 60 })), env, resolver)).toBeNull();
});

test("missing header", async () => {
  expect(await verifyAdmin(req(), env, resolver)).toBeNull();
});

test("dev bypass only outside production", async () => {
  expect(await verifyAdmin(req(), { ...env, ENVIRONMENT: "development", DEV_ADMIN_BYPASS: "true" }, resolver)).toEqual({ email: "dev@localhost" });
  expect(await verifyAdmin(req(), { ...env, ENVIRONMENT: "production", DEV_ADMIN_BYPASS: "true" }, resolver)).toBeNull();
});
