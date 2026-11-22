import { createTestDb } from "./helpers/d1";
import { FakeMailer, clock, MIN, HOUR, DAY } from "./helpers/fakes";
import { randomToken, sha256Hex } from "../src/lib/auth/tokens";
import { issueLoginLink, requestLogin, verifyLogin } from "../src/lib/auth/login";
import { createSession, getSessionCustomer, destroySession, sessionCookie, clearSessionCookie, SESSION_COOKIE } from "../src/lib/auth/session";
import { upsertCustomer } from "../src/lib/db/customers";

const SITE = "https://s.test";
const tokenFrom = (url: string) => new URL(url).searchParams.get("token")!;
const linkIn = (text: string) => /https:\/\/s\.test\/auth\/verify\?token=[\w-]+/.exec(text)![0];

test("randomToken and sha256Hex", async () => {
  const a = randomToken();
  expect(a.length).toBeGreaterThanOrEqual(43);
  expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(randomToken()).not.toBe(a);
  expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("issueLoginLink stores only the hash", async () => {
  const db = await createTestDb();
  const url = await issueLoginLink(db, "A@B.co", SITE, clock()(), 15);
  const token = tokenFrom(url);
  const row = await db.prepare("SELECT * FROM login_tokens").first<any>();
  expect(row.token_hash).toBe(await sha256Hex(token));
  expect(row.token_hash).not.toBe(token);
  expect(row.email).toBe("a@b.co");
});

test("verifyLogin: valid token creates a session exactly once", async () => {
  const db = await createTestDb();
  const now = clock();
  const c = await upsertCustomer(db, "a@b.co", now());
  const token = tokenFrom(await issueLoginLink(db, "a@b.co", SITE, now(), 15));
  const s = await verifyLogin({ db, now }, token);
  expect(s).not.toBeNull();
  expect((await getSessionCustomer(db, s!.sessionToken, now()))?.id).toBe(c.id);
  expect(await verifyLogin({ db, now }, token)).toBeNull();
});

test("verifyLogin: expires after 15 minutes", async () => {
  const db = await createTestDb();
  const now = clock();
  await upsertCustomer(db, "a@b.co", now());
  const token = tokenFrom(await issueLoginLink(db, "a@b.co", SITE, now(), 15));
  now.advance(16 * MIN);
  expect(await verifyLogin({ db, now }, token)).toBeNull();
});

test("verifyLogin: garbage token", async () => {
  const db = await createTestDb();
  expect(await verifyLogin({ db, now: clock() }, "nope")).toBeNull();
  expect(await verifyLogin({ db, now: clock() }, "")).toBeNull();
});

test("requestLogin: emails existing customers only", async () => {
  const db = await createTestDb();
  const mailer = new FakeMailer();
  const now = clock();
  await requestLogin({ db, mailer, siteUrl: SITE, storeName: "Shelfmade", now }, "unknown@b.co");
  expect(mailer.sent).toHaveLength(0);
  await upsertCustomer(db, "a@b.co", now());
  await requestLogin({ db, mailer, siteUrl: SITE, storeName: "Shelfmade", now }, "  A@B.co ");
  expect(mailer.sent).toHaveLength(1);
  expect(mailer.sent[0].to).toBe("a@b.co");
  const s = await verifyLogin({ db, now }, tokenFrom(linkIn(mailer.sent[0].text)));
  expect(s).not.toBeNull();
});

test("requestLogin: at most 5 per email per hour", async () => {
  const db = await createTestDb();
  const mailer = new FakeMailer();
  const now = clock();
  await upsertCustomer(db, "a@b.co", now());
  const deps = { db, mailer, siteUrl: SITE, storeName: "Shelfmade", now };
  for (let i = 0; i < 6; i++) await requestLogin(deps, "a@b.co");
  expect(mailer.sent).toHaveLength(5);
  now.advance(HOUR + MIN);
  await requestLogin(deps, "a@b.co");
  expect(mailer.sent).toHaveLength(6);
});

test("requestLogin: invalid email is ignored", async () => {
  const db = await createTestDb();
  const mailer = new FakeMailer();
  await requestLogin({ db, mailer, siteUrl: SITE, storeName: "S", now: clock() }, "not-an-email");
  expect(mailer.sent).toHaveLength(0);
});

test("sessions expire after 30 days and can be destroyed", async () => {
  const db = await createTestDb();
  const now = clock();
  const c = await upsertCustomer(db, "a@b.co", now());
  const s = await createSession(db, c.id, now());
  now.advance(29 * DAY);
  expect(await getSessionCustomer(db, s.token, now())).not.toBeNull();
  now.advance(2 * DAY);
  expect(await getSessionCustomer(db, s.token, now())).toBeNull();
  const s2 = await createSession(db, c.id, now());
  await destroySession(db, s2.token);
  expect(await getSessionCustomer(db, s2.token, now())).toBeNull();
  expect(await getSessionCustomer(db, "", now())).toBeNull();
});

test("session cookies", () => {
  const c = sessionCookie("tok", new Date("2026-12-22T10:00:00Z"));
  expect(SESSION_COOKIE).toBe("__Host-sm_session");
  for (const part of ["__Host-sm_session=tok", "HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Expires="]) expect(c).toContain(part);
  expect(clearSessionCookie()).toContain("Max-Age=0");
});
