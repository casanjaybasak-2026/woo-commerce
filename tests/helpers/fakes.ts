import type { Mailer, MailMessage } from "../../src/lib/email/mailer";
import type { CheckoutSessionParams, PaymentGateway, StripeEventLike } from "../../src/lib/payments";

export class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  fail = false;
  async send(m: MailMessage) {
    if (this.fail) throw new Error("mail down");
    this.sent.push(m);
  }
}

export class FakeGateway implements PaymentGateway {
  sessions: CheckoutSessionParams[] = [];
  async createCheckoutSession(p: CheckoutSessionParams) {
    this.sessions.push(p);
    const n = this.sessions.length;
    return { id: `cs_test_${n}`, url: `https://checkout.stripe.test/${n}` };
  }
  async constructEvent(rawBody: string, signature: string): Promise<StripeEventLike> {
    if (signature !== "valid") throw new Error("bad signature");
    return JSON.parse(rawBody);
  }
}

/** A mutable clock: call advance(ms) to move time forward. */
export function clock(iso = "2026-11-22T10:00:00.000Z") {
  let t = new Date(iso).getTime();
  const now = () => new Date(t);
  now.advance = (ms: number) => {
    t += ms;
  };
  return now;
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export async function seedProduct(
  db: D1Database,
  p: Partial<{ id: string; slug: string; title: string; priceCents: number; published: boolean; deletedAt: string | null; category: string | null; shortDesc: string; createdAt: string }> = {},
) {
  const id = p.id ?? "p1";
  await db
    .prepare(
      `INSERT INTO products (id, slug, title, category, short_desc, long_desc_md, price_cents, published, sort, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      id, p.slug ?? id, p.title ?? "Product " + id, p.category ?? null, p.shortDesc ?? "",
      p.priceCents ?? 1900, p.published === false ? 0 : 1,
      p.createdAt ?? "2026-11-01T00:00:00.000Z", p.createdAt ?? "2026-11-01T00:00:00.000Z", p.deletedAt ?? null,
    )
    .run();
  return id;
}

export async function seedFile(db: D1Database, id: string, productId: string, archived = false) {
  await db
    .prepare(
      `INSERT INTO product_files (id, product_id, r2_key, display_name, size_bytes, content_type, created_at, archived_at)
       VALUES (?, ?, ?, ?, 1024, 'application/pdf', '2026-11-01T00:00:00.000Z', ?)`,
    )
    .bind(id, productId, `products/${productId}/${id}.pdf`, `${id}.pdf`, archived ? "2026-11-02T00:00:00.000Z" : null)
    .run();
}
