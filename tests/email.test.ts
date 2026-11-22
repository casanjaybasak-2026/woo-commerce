import { ResendMailer } from "../src/lib/email/mailer";
import { loginLinkEmail, orderConfirmationEmail } from "../src/lib/email/templates";

const order = { publicId: "pub1", totalCents: 1520, subtotalCents: 1900, discountCents: 380 };
const items = [{ titleSnapshot: "Budget <b>Planner</b>", priceCentsSnapshot: 1900 }];

test("order confirmation email", () => {
  const m = orderConfirmationEmail({ storeName: "Shelfmade", siteUrl: "https://s.test", order, items, loginUrl: "https://s.test/auth/verify?token=abc" });
  expect(m.subject).toBe("Your Shelfmade order is ready");
  for (const body of [m.html, m.text]) {
    expect(body).toContain("$15.20");
    expect(body).toContain("https://s.test/auth/verify?token=abc");
  }
  expect(m.html).toContain("Budget &lt;b&gt;Planner&lt;/b&gt;");
  expect(m.html).not.toContain("<b>Planner");
  expect(m.text).toContain("Budget <b>Planner</b>");
  expect(m.html).toContain("-$3.80");
});

test("login link email", () => {
  const m = loginLinkEmail({ storeName: "Shelfmade", loginUrl: "https://s.test/auth/verify?token=x" });
  expect(m.subject).toBe("Your Shelfmade sign-in link");
  expect(m.text).toContain("15 minutes");
  expect(m.html).toContain("https://s.test/auth/verify?token=x");
});

test("ResendMailer posts to Resend with bearer auth", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const m = new ResendMailer("key_123", "Shelfmade <hi@s.test>", fetchFn);
  await m.send({ to: "a@b.c", subject: "S", html: "<p>h</p>", text: "h" });
  expect(calls[0].url).toBe("https://api.resend.com/emails");
  expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer key_123");
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ from: "Shelfmade <hi@s.test>", to: ["a@b.c"], subject: "S", html: "<p>h</p>", text: "h" });
});

test("ResendMailer throws on non-2xx", async () => {
  const fetchFn = (async () => new Response('{"message":"bad"}', { status: 422 })) as unknown as typeof fetch;
  await expect(new ResendMailer("k", "f", fetchFn).send({ to: "a@b.c", subject: "S", html: "", text: "" })).rejects.toThrow(/422/);
});
