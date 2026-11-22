# Shelfmade Store Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Execute task-by-task.

**Goal:** A working digital-products store (Shelfmade) on Cloudflare Workers: catalog, cart, Stripe checkout, secure delivery through a customer Library, a simple admin, and auto-deploy from GitHub.

**Architecture:** A single Astro app (server output) deployed to Cloudflare Workers through `@astrojs/cloudflare`. Business logic lives in framework-free TypeScript modules under `src/lib/` that take their dependencies (D1, payment gateway, mailer, clock) as arguments, so they can be unit-tested. Astro pages and API routes are thin adapters over those modules.

**Tech Stack:** Astro 7, `@astrojs/cloudflare` 14, Wrangler 4, D1, R2, Stripe SDK 23 (fetch client and SubtleCrypto), `jose` 6 (Access JWT), `marked` 18, Vitest 5, TypeScript, Resend HTTP API.

**Spec:** `docs/specs/2026-11-22-shelfmade-store-design.md`

## Global Constraints

- Workers runtime only. No Node built-ins in `src/` (use Web Crypto, `fetch`, `crypto.randomUUID()`).
- Money is integer cents everywhere. Currency is `usd`. Display uses `formatUsd`.
- The price charged is always loaded from D1. Client-sent prices are never read.
- Orders become `paid` only inside the verified Stripe webhook handler.
- R2 bucket `FILES` is private. Only `covers/*` keys are served publicly (`/media/*`). Deliverables are served only through `/download/<fileId>` after authorisation.
- Download limit: 20 per file per 24h per customer.
- Login link: 32-byte random token, only the SHA-256 hash stored, expires in 15 minutes, single use. Session: random token, hash stored, 30 days, cookie `__Host-sm_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Emails normalised with `trim().toLowerCase()` before storing or comparing.
- `/admin*` and `/api/admin*` require a verified Cloudflare Access JWT whose email is in `ADMIN_EMAILS`. `DEV_ADMIN_BYPASS=true` works only when `ENVIRONMENT !== "production"`.
- Store name `Shelfmade` comes from the `STORE_NAME` var. Never hard-code it in components.
- All env access goes through `src/lib/env.ts` (`getEnv()`), so an adapter API change touches one file.
- `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `.env` are git-ignored.

## Review Focus

1. **Stripe retries a webhook event.** Expect no duplicate entitlements and no second email. Pinned by `handleStripeEvent › returns "duplicate" and sends no email on a repeated event id` (Task 5).
2. **A product's price changes or it is unpublished after it went into a cart.** Expect checkout to charge the current DB price and drop unpublished or deleted items. Pinned by `startCheckout › uses DB price, ignores client price, drops unpublished` (Task 4).
3. **A promo code changes the amount paid.** Expect the order to record Stripe's `amount_subtotal`, `amount_total` and the discount, not the pre-discount total. Pinned by `handleStripeEvent › records totals from the session` (Task 5).
4. **A partial refund in Stripe.** Expect access to stay. Only a full refund (`charge.refunded === true`) revokes it. Pinned by `handleStripeEvent › partial refund keeps access` (Task 5).
5. **The admin deletes a product that has buyers.** Expect a soft delete: it disappears from the shop, but buyers can still download. Pinned by `deleteProduct › soft-deletes when orders exist` (Task 3) and `authorizeDownload › allows soft-deleted product files for entitled buyers` (Task 7).

---

## File Structure

```
astro.config.mjs            Astro + cloudflare adapter, output "server"
wrangler.jsonc              Worker name "shelfmade", D1 "DB", R2 "FILES", vars
vitest.config.ts            node env, tests/**/*.test.ts
tsconfig.json
package.json                scripts: dev, build, test, typecheck, db:migrate:local, db:migrate:remote, deploy
migrations/0001_init.sql    full schema (spec §9)
src/env.d.ts                Env interface, App.Locals { customer, adminEmail }
src/lib/env.ts              getEnv(): Env
src/lib/types.ts            Product, ProductFile, Order, OrderItem, Customer, OrderStatus
src/lib/money.ts            formatUsd, parseUsdToCents
src/lib/slug.ts             slugify
src/lib/cart.ts             normalizeCart, priceCart
src/lib/db/products.ts      product + file repository
src/lib/db/orders.ts        order repository
src/lib/db/customers.ts     upsertCustomer, getCustomerByEmail
src/lib/payments.ts         PaymentGateway interface, StripeGateway
src/lib/checkout.ts         startCheckout, buildSessionParams, CheckoutError
src/lib/webhook.ts          handleStripeEvent
src/lib/auth/tokens.ts      randomToken, sha256Hex
src/lib/auth/login.ts       issueLoginLink, requestLogin, verifyLogin
src/lib/auth/session.ts     createSession, getSessionCustomer, destroySession, sessionCookie
src/lib/downloads.ts        authorizeDownload
src/lib/admin/access.ts     verifyAdmin
src/lib/email/mailer.ts     Mailer interface, ResendMailer
src/lib/email/templates.ts  orderConfirmationEmail, loginLinkEmail
src/lib/markdown.ts         renderMarkdown (raw HTML stripped)
src/middleware.ts           loads customer session; guards admin
src/styles/                 tokens.css, base.css (Task 10)
src/layouts/                Base.astro, Admin.astro
src/components/             Header, Footer, ProductCard, Price, Button, CartBadge, EmptyState, ...
src/scripts/cart.ts         browser cart (localStorage) + badge sync
src/pages/                  storefront, account, admin, legal, api routes (Tasks 11-14)
tests/helpers/d1.ts         node:sqlite adapter implementing the D1 subset + applyMigrations
tests/helpers/fakes.ts      FakeMailer, FakeGateway, fixedClock, seed helpers
tests/**/*.test.ts
.github/workflows/deploy.yml
README.md .env.example .dev.vars.example .gitignore
docs/design-system.md docs/launch-checklist.md
```

**Plan call (deviation from spec §9 Testing):** the D1 data layer is tested against real SQLite through a small `node:sqlite` adapter that implements the D1 API subset we use (`prepare().bind().first/all/run`, `batch`). It runs the same `migrations/*.sql`. This avoids the version-coupling of `@cloudflare/vitest-pool-workers` with Vitest 5 while still running real SQL. The SQL is SQLite in both places.

**Plan call (execution order):** core logic (Tasks 2–9) is built test-first before the UI (Tasks 10–14), so pages are wired to tested functions. The design system (ui-ux-pro-max) is Task 10, and storefront pages (frontend-design) are Tasks 11–14.

**Plan call:** the order confirmation email's login link uses the same token mechanism with a **72-hour** expiry (a 15-minute link in a receipt would often be dead by the time it's read). Login-request links stay at 15 minutes.

---

### Task 1: Scaffold, schema, and test harness

**Files:**
- Create: `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/env.d.ts`, `src/lib/env.ts`, `src/lib/types.ts`, `src/pages/index.astro` (placeholder), `migrations/0001_init.sql`, `tests/helpers/d1.ts`, `tests/helpers/fakes.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `createTestDb(): Promise<D1Database>` (fresh in-memory DB with all migrations applied); `fixedClock(iso: string): () => Date`; `FakeMailer { sent: MailMessage[] }`; `FakeGateway { sessions: CheckoutSessionParams[] }`; `getEnv(): Env`.
- `Env` fields: `DB: D1Database; FILES: R2Bucket; SITE_URL; STORE_NAME; ENVIRONMENT; CURRENCY; STRIPE_SECRET_KEY; STRIPE_WEBHOOK_SECRET; RESEND_API_KEY; EMAIL_FROM; ADMIN_EMAILS; CF_ACCESS_TEAM_DOMAIN; CF_ACCESS_AUD; DEV_ADMIN_BYPASS?; STRIPE_AUTOMATIC_TAX?`.

- [ ] **Step 1:** `git init`, add the remote `https://github.com/casanjaybasak-2026/woo-commerce.git`, and write `.gitignore`.
- [ ] **Step 2:** Create `package.json` with deps `astro@^7`, `@astrojs/cloudflare@^14`, `stripe@^23`, `jose@^6`, `marked@^18` and devDeps `wrangler@^4`, `vitest@^5`, `typescript`, `@cloudflare/workers-types`, `@astrojs/check`. Run `npm install`. Read the installed adapter's README for the env-access API and implement `getEnv()` with it.
- [ ] **Step 3:** Write `migrations/0001_init.sql` with every table in spec §9. Constraints: `products.slug UNIQUE`, `customers.email UNIQUE`, `orders.public_id UNIQUE`, `orders.stripe_session_id UNIQUE`, `entitlements UNIQUE(customer_id, product_id, order_id)`, `stripe_events.event_id PRIMARY KEY`, `orders.status CHECK IN ('pending','paid','refunded','expired')`. Index `download_events(entitlement_id, file_id, at)` and `login_tokens(email, created_at)`. Add a `created_at` column to `login_tokens` for rate limiting.
- [ ] **Step 4: Write the failing test** `tests/schema.test.ts`:

```ts
test("migrations create all tables", async () => {
  const db = await createTestDb();
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>();
  expect(results.map(r => r.name)).toEqual(expect.arrayContaining([
    "products","product_files","customers","orders","order_items","entitlements",
    "login_tokens","sessions","download_events","stripe_events"]));
});
test("rejects unknown order status", async () => {
  const db = await createTestDb();
  await expect(db.prepare("INSERT INTO orders (id, public_id, customer_email, status, subtotal_cents, discount_cents, total_cents, currency, created_at) VALUES ('o','p','a@b.c','bogus',0,0,0,'usd','x')").run()).rejects.toThrow();
});
```

- [ ] **Step 5:** Run `npx vitest run tests/schema.test.ts`. Expected: FAIL (`createTestDb` is not defined).
- [ ] **Step 6:** Implement `tests/helpers/d1.ts` (wraps `DatabaseSync` from `node:sqlite`; `first()` returns a row or `null`, `all()` returns `{results}`, `run()` returns `{meta:{changes}}`, `batch()` runs in a transaction; it reads `migrations/*.sql` in order) and `tests/helpers/fakes.ts`.
- [ ] **Step 7:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: build succeeds.
- [ ] **Step 8:** Commit: `chore: scaffold Astro on Cloudflare with D1 schema and test harness`.

### Task 2: Money, slug, cart pricing

**Files:** Create `src/lib/money.ts`, `src/lib/slug.ts`, `src/lib/cart.ts`. Test: `tests/money.test.ts`, `tests/cart.test.ts`.

**Interfaces:**
- Produces: `formatUsd(cents: number): string`; `parseUsdToCents(input: string): number` (throws `RangeError`); `slugify(s: string): string`; `normalizeCart(input: unknown): string[]`; `priceCart(ids: string[], products: Product[]): { lines: CartLine[]; subtotalCents: number; missing: string[] }`, where `CartLine = { productId; title; slug; priceCents }`.

- [ ] **Step 1: Write the failing tests:**

```ts
expect(formatUsd(1900)).toBe("$19.00"); expect(formatUsd(123456)).toBe("$1,234.56");
expect(parseUsdToCents("19.99")).toBe(1999); expect(parseUsdToCents("$5")).toBe(500);
expect(() => parseUsdToCents("-1")).toThrow(RangeError);
expect(() => parseUsdToCents("abc")).toThrow(RangeError);
expect(() => parseUsdToCents("1000000")).toThrow(RangeError); // max 999999.99
expect(parseUsdToCents("0.1")).toBe(10);
expect(slugify("  Notion Budget Planner — 2027! ")).toBe("notion-budget-planner-2027");
expect(normalizeCart(["a","a"," b ",3,null])).toEqual(["a","b"]);
expect(normalizeCart("nope")).toEqual([]);
expect(normalizeCart(Array.from({length:60},(_,i)=>"p"+i))).toHaveLength(50);
// priceCart: published p1 (1900), unpublished p2, deleted p3, missing p4
expect(priceCart(["p1","p2","p3","p4"], products)).toEqual({
  lines:[{productId:"p1",title:"One",slug:"one",priceCents:1900}], subtotalCents:1900, missing:["p2","p3","p4"] });
```

- [ ] **Step 2:** Run `npx vitest run tests/money.test.ts tests/cart.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules. `formatUsd` uses `Intl.NumberFormat("en-US",{style:"currency",currency:"USD"})`. `priceCart` keeps the input order.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: money formatting, slugs and cart pricing`.

### Task 3: Product repository

**Files:** Create `src/lib/db/products.ts`. Test: `tests/db/products.test.ts`.

**Interfaces:**
- Consumes: `slugify`, `Product`, `ProductFile`.
- Produces:
  - `listPublished(db, opts?: { category?: string; q?: string; sort?: "newest"|"price_asc"|"price_desc" }): Promise<Product[]>`
  - `getProductBySlug(db, slug): Promise<Product|null>` (published and not deleted only)
  - `getProductsByIds(db, ids: string[]): Promise<Product[]>` (includes unpublished and deleted, so callers decide)
  - `listAllProducts(db): Promise<Product[]>` (admin; excludes deleted)
  - `listCategories(db): Promise<string[]>`
  - `saveProduct(db, input: ProductInput, now: Date): Promise<Product>` (insert when `input.id` is absent; slug auto-filled from title; on slug collision append `-2`, `-3`, ...)
  - `deleteProduct(db, id, now): Promise<"deleted"|"soft-deleted">`
  - `listFiles(db, productId): Promise<ProductFile[]>`; `addFile(db, f: Omit<ProductFile,"id">): Promise<ProductFile>`; `removeFile(db, fileId): Promise<ProductFile|null>`

- [ ] **Step 1: Write the failing tests:** `saveProduct › generates unique slugs` (two products titled "Planner" get `planner` and `planner-2`); `listPublished › hides unpublished and deleted`; `listPublished › filters by category and q (title or short_desc, case-insensitive)`; `listPublished › sorts by price_asc`; `deleteProduct › hard-deletes when no orders` (expects `"deleted"`, row gone); `deleteProduct › soft-deletes when orders exist` (expects `"soft-deleted"`, `getProductBySlug` returns null, `getProductsByIds` still returns it with `deletedAt` set).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with parameterised SQL only. The `q` search uses `LIKE` with `%` and `_` escaped.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: product repository`.

### Task 4: Orders, payment gateway, checkout

**Files:** Create `src/lib/db/orders.ts`, `src/lib/db/customers.ts`, `src/lib/payments.ts`, `src/lib/checkout.ts`. Test: `tests/checkout.test.ts`.

**Interfaces:**
- Consumes: `normalizeCart`, `priceCart`, `getProductsByIds`.
- Produces:
  - `PaymentGateway { createCheckoutSession(p: CheckoutSessionParams): Promise<{id:string; url:string}>; constructEvent(rawBody: string, signature: string): Promise<StripeEventLike> }`
  - `class StripeGateway implements PaymentGateway` (constructor `(secretKey, webhookSecret)`; uses `Stripe.createFetchHttpClient()` and `constructEventAsync` with `Stripe.createSubtleCryptoProvider()`)
  - `buildSessionParams(order: {publicId; id}, lines: CartLine[], siteUrl: string, opts: {automaticTax: boolean}): CheckoutSessionParams`
  - `startCheckout(deps: {db; gateway; siteUrl; automaticTax; now: () => Date}, rawCart: unknown): Promise<{url: string; publicId: string}>`; throws `CheckoutError` with `code: "EMPTY_CART" | "NO_VALID_ITEMS"`
  - orders repo: `createPendingOrder(db, {lines, subtotalCents, now}): Promise<Order>`, `setStripeSession(db, orderId, sessionId)`, `getOrderByPublicId`, `getOrderById`, `getOrderByPaymentIntent`, `markPaid(db, orderId, {email, customerId, subtotalCents, discountCents, totalCents, paymentIntent, now})`, `markExpired`, `markRefunded`, `listOrders(db, {status?, limit, offset})`, `listOrderItems(db, orderId)`
  - customers repo: `upsertCustomer(db, email, now): Promise<Customer>`, `getCustomerByEmail(db, email)`

- [ ] **Step 1: Write the failing tests:**

```ts
test("buildSessionParams", () => {
  const p = buildSessionParams({id:"o1",publicId:"pub1"}, [{productId:"p1",title:"One",slug:"one",priceCents:1900}], "https://s.test", {automaticTax:false});
  expect(p).toMatchObject({ mode:"payment", allow_promotion_codes:true, metadata:{order_id:"o1"},
    client_reference_id:"o1",
    success_url:"https://s.test/checkout/success?order=pub1", cancel_url:"https://s.test/cart",
    line_items:[{quantity:1, price_data:{currency:"usd", unit_amount:1900, product_data:{name:"One"}}}] });
  expect(p.automatic_tax).toBeUndefined();
});
test("startCheckout › uses DB price, ignores client price, drops unpublished", async () => {
  // seed p1 published 1900, p2 unpublished
  const r = await startCheckout(deps, ["p1","p2",{id:"p1",price:1}]);
  expect(gateway.sessions[0].line_items).toHaveLength(1);
  expect(gateway.sessions[0].line_items[0].price_data.unit_amount).toBe(1900);
  const order = await getOrderByPublicId(db, r.publicId);
  expect(order).toMatchObject({status:"pending", subtotalCents:1900, stripeSessionId:"cs_test_1"});
});
test("startCheckout › empty cart", () => expect(startCheckout(deps, [])).rejects.toMatchObject({code:"EMPTY_CART"}));
test("startCheckout › only invalid items", () => expect(startCheckout(deps, ["p2"])).rejects.toMatchObject({code:"NO_VALID_ITEMS"}));
```

- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. `publicId` = `randomToken(12)` (Task 6's function; implement `tokens.ts` here if Task 6 hasn't run yet). Order ids come from `crypto.randomUUID()`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: server-priced checkout with Stripe Checkout sessions`.

### Task 5: Stripe webhook handling

**Files:** Create `src/lib/webhook.ts`. Test: `tests/webhook.test.ts`.

**Interfaces:**
- Consumes: orders and customers repos, `issueLoginLink` (Task 6; build Task 6 first if needed), `Mailer`, `orderConfirmationEmail`.
- Produces: `handleStripeEvent(deps: {db; mailer: Mailer; siteUrl; storeName; now}, event: StripeEventLike): Promise<"processed"|"duplicate"|"ignored">`.
- `StripeEventLike = { id: string; type: string; data: { object: any } }`.

- [ ] **Step 1: Write the failing tests** (seed a pending order `o1` with product p1 at 1900):
  - `checkout.session.completed paid › marks order paid, creates entitlement, emails buyer`: event object `{id:"cs_test_1", payment_status:"paid", metadata:{order_id:"o1"}, customer_details:{email:"Buyer@Example.com"}, amount_subtotal:1900, amount_total:1900, total_details:{amount_discount:0}, payment_intent:"pi_1"}`. Expect order `status "paid"`, `customerEmail "buyer@example.com"`, one entitlement row, `mailer.sent[0].to === "buyer@example.com"`, and the html contains `/auth/verify?token=`. Return value `"processed"`.
  - `records totals from the session`: `amount_subtotal:1900, amount_total:1520, amount_discount:380`. Expect order `subtotalCents 1900, discountCents 380, totalCents 1520`.
  - `returns "duplicate" and sends no email on a repeated event id`: handle the same event twice. Second result `"duplicate"`, `mailer.sent.length === 1`, one entitlement.
  - `payment_status "unpaid" is ignored` (async payment pending). Order stays `pending`. Then `checkout.session.async_payment_succeeded` with the same object marks it paid.
  - `unknown order id › "ignored"`, no throw.
  - `checkout.session.expired › order expired`.
  - `charge.refunded full › order refunded and entitlements revoked`: object `{payment_intent:"pi_1", refunded:true}`. Expect `revoked_at` set.
  - `partial refund keeps access`: `{payment_intent:"pi_1", refunded:false, amount_refunded:500}` returns `"ignored"`, entitlement still active.
  - `already-paid order is not re-processed by a different event id` (for example `completed` then `async_payment_succeeded`): one email only.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Insert into `stripe_events` first (`INSERT OR IGNORE`). If zero changes, return `"duplicate"`. Paid transitions only apply from `pending`. If mail sending throws, log it and still return `"processed"` (the order is paid, and the admin can resend).
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: idempotent Stripe webhook handling with entitlements and refunds`.

### Task 6: Passwordless login and sessions

**Files:** Create `src/lib/auth/tokens.ts`, `src/lib/auth/login.ts`, `src/lib/auth/session.ts`. Test: `tests/auth.test.ts`.

**Interfaces:**
- Produces:
  - `randomToken(bytes = 32): string` (base64url); `sha256Hex(s: string): Promise<string>`
  - `issueLoginLink(db, email, siteUrl, now: Date, ttlMinutes: number): Promise<string>` returns `${siteUrl}/auth/verify?token=…`
  - `requestLogin(deps: {db; mailer; siteUrl; storeName; now}, rawEmail: string): Promise<void>` (sends only if a customer exists; max 5 tokens per email per rolling hour, silently drops extras; ttl 15)
  - `verifyLogin(deps: {db; now}, token: string): Promise<{sessionToken: string; expiresAt: Date} | null>`
  - `createSession(db, customerId, now): Promise<{token; expiresAt}>`; `getSessionCustomer(db, token, now): Promise<Customer|null>`; `destroySession(db, token)`
  - `sessionCookie(token: string, expiresAt: Date): string`; `clearSessionCookie(): string`; `SESSION_COOKIE = "__Host-sm_session"`

- [ ] **Step 1: Write the failing tests:**
  - `randomToken` length ≥ 43 for 32 bytes, and two calls differ. `sha256Hex("abc")` equals `"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`.
  - `issueLoginLink` stores the hash, not the raw token (the DB row's `token_hash !== token`).
  - `verifyLogin › valid token creates session once`: the second verify of the same token returns `null`.
  - `verifyLogin › expired after 15 minutes`: clock +16 min returns `null`.
  - `requestLogin › unknown email sends nothing`; `requestLogin › 6th request in an hour sends nothing`.
  - `getSessionCustomer › expired after 30 days returns null`; `destroySession` makes it return `null`.
  - `sessionCookie` contains `__Host-sm_session=`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Expires=`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with `crypto.getRandomValues` and `crypto.subtle.digest`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: passwordless email login and sessions`.

### Task 7: Secure download authorisation

**Files:** Create `src/lib/downloads.ts`. Test: `tests/downloads.test.ts`.

**Interfaces:**
- Produces: `authorizeDownload(deps: {db; now}, customerId: string, fileId: string): Promise<{ok: true; file: ProductFile} | {ok: false; reason: "NOT_FOUND"|"NOT_ENTITLED"|"RATE_LIMITED"}>` (records a `download_events` row on success); `listLibrary(db, customerId): Promise<Array<{product: Product; files: ProductFile[]; purchasedAt: string}>>` (active entitlements only, includes soft-deleted products); `DOWNLOAD_LIMIT = 20`.

- [ ] **Step 1: Write the failing tests:** `entitled buyer gets file`; `other customer › NOT_ENTITLED`; `unknown file › NOT_FOUND`; `revoked entitlement › NOT_ENTITLED`; `21st download within 24h › RATE_LIMITED`, then clock +24h01m returns ok; `allows soft-deleted product files for entitled buyers`; `listLibrary` excludes revoked entitlements and lists the files.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: entitlement-checked, rate-limited downloads`.

### Task 8: Admin access verification

**Files:** Create `src/lib/admin/access.ts`. Test: `tests/admin-access.test.ts`.

**Interfaces:**
- Produces: `verifyAdmin(request: Request, env: Pick<Env,"ADMIN_EMAILS"|"CF_ACCESS_TEAM_DOMAIN"|"CF_ACCESS_AUD"|"ENVIRONMENT"|"DEV_ADMIN_BYPASS">, keyResolver?: JWTVerifyGetKey): Promise<{email: string} | null>`. The default resolver is `createRemoteJWKSet(new URL(\`https://${team}/cdn-cgi/access/certs\`))`.

- [ ] **Step 1: Write the failing tests** (generate an RS256 key pair with `jose.generateKeyPair`, sign tokens, pass a local resolver): `valid JWT with allowed email › {email}`; `email not in ADMIN_EMAILS (comma list, case-insensitive) › null`; `wrong aud › null`; `expired › null`; `missing header › null`; `DEV_ADMIN_BYPASS in development › {email:"dev@localhost"}`; `DEV_ADMIN_BYPASS in production › null`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Read the `Cf-Access-Jwt-Assertion` header and verify `issuer: https://${team}` and `audience: CF_ACCESS_AUD`.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: Cloudflare Access JWT verification for admin`.

### Task 9: Email templates, Resend mailer, markdown

**Files:** Create `src/lib/email/mailer.ts`, `src/lib/email/templates.ts`, `src/lib/markdown.ts`. Test: `tests/email.test.ts`, `tests/markdown.test.ts`.

**Interfaces:**
- Produces: `MailMessage = {to; subject; html; text}`; `Mailer { send(m: MailMessage): Promise<void> }`; `class ResendMailer implements Mailer` (constructor `(apiKey, from, fetchFn = fetch)`; POST to `https://api.resend.com/emails`; throws on non-2xx); `orderConfirmationEmail({storeName, order, items, loginUrl}): Omit<MailMessage,"to">`; `loginLinkEmail({storeName, loginUrl}): Omit<MailMessage,"to">`; `renderMarkdown(md: string): string`.

- [ ] **Step 1: Write the failing tests:** order email subject is `"Your Shelfmade order is ready"`, and html and text contain each item title, `formatUsd(total)` and `loginUrl`. Login email subject is `"Your Shelfmade sign-in link"` and the text mentions `15 minutes`. Titles are HTML-escaped (`<b>` becomes `&lt;b&gt;`). `ResendMailer` sends `Authorization: Bearer key` and JSON `{from,to,subject,html,text}` (using a fake `fetchFn`), and throws on a 422 response. `renderMarkdown("# Hi\n<script>x</script>")` contains `<h1>` and not `<script`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Templates use inline-styled, table-based HTML matching the design tokens (Task 10 colours can be applied afterwards). `marked` uses a renderer whose `html()` returns `""`, and `javascript:` hrefs are dropped.
- [ ] **Step 4:** Run them. Expected: PASS. Run `npx vitest run` (full suite). Expected: PASS.
- [ ] **Step 5:** Commit: `feat: transactional emails via Resend and safe markdown`.

### Task 10: Design system and layout shell (ui-ux-pro-max)

**Files:** Create `docs/design-system.md`, `src/styles/tokens.css`, `src/styles/base.css`, `src/layouts/Base.astro`, `src/layouts/Admin.astro`, `src/components/{Header,Footer,Button,Price,ProductCard,CartBadge,EmptyState,Notice}.astro`, `src/scripts/cart.ts`.

**Interfaces:**
- Produces: CSS custom properties (`--color-*`, `--font-*`, `--space-1..10`, `--radius-*`, `--shadow-*`, `--container: 1200px`); `Base.astro` props `{title: string; description?: string; ogImage?: string; jsonLd?: object}`; `ProductCard` props `{product: Product}`; `Price` props `{cents: number; compareAtCents?: number|null}`; browser `cart` API in `src/scripts/cart.ts`: `getCart(): string[]`, `addToCart(id)`, `removeFromCart(id)`, `clearCart()`, dispatching the `cart:change` event.

- [ ] **Step 1:** Run the ui-ux-pro-max skill and write `docs/design-system.md`: palette (white base, one accent, neutral greys, AA contrast), type (system or one Google font pairing), spacing scale, radius, shadows, components (buttons, cards, forms, notices) and UX rules (Astra-like: centred 1200px container, sticky simple header, generous whitespace, one primary CTA per view, visible focus rings, 44px touch targets).
- [ ] **Step 2:** Implement tokens, base styles, layouts and components to match the doc. The header shows the logo (text `STORE_NAME`), nav (Shop, Library, About) and the cart badge.
- [ ] **Step 3:** Run `npm run build`. Expected: success. Check in the browser (`npm run dev`) at 375px and 1280px widths.
- [ ] **Step 4:** Commit: `feat: Shelfmade design system and layout shell`.

### Task 11: Storefront pages and checkout routes (frontend-design)

**Files:** Create `src/pages/index.astro`, `src/pages/shop.astro`, `src/pages/p/[slug].astro`, `src/pages/cart.astro`, `src/pages/checkout/success.astro`, `src/pages/api/checkout.ts`, `src/pages/api/orders/[publicId]/status.ts`, `src/pages/api/cart-preview.ts`, `src/pages/api/stripe/webhook.ts`, `src/pages/media/[...key].ts`, `src/pages/404.astro`.

**Interfaces:**
- Consumes: `listPublished`, `listCategories`, `getProductBySlug`, `listFiles`, `priceCart`, `getProductsByIds`, `startCheckout`, `StripeGateway`, `handleStripeEvent`, `ResendMailer`, `renderMarkdown`.
- Route contracts:
  - `POST /api/cart-preview` body `{ids: string[]}` returns `{lines, subtotalCents, missing}`. The cart page renders from this and removes `missing` ids from localStorage.
  - `POST /api/checkout` body `{ids}` returns `200 {url}`, or `400 {error: code}` for a `CheckoutError`.
  - `GET /api/orders/:publicId/status` returns `{status}`.
  - `POST /api/stripe/webhook` takes the raw body and `stripe-signature`. Returns `400` on bad signature, otherwise `200 {result}`. On an internal error it returns `500` so Stripe retries.
  - `GET /media/:key` serves only `covers/` keys with `Cache-Control: public, max-age=31536000, immutable`. Anything else returns 404.

- [ ] **Step 1:** Run the frontend-design skill for the home, shop, product and cart pages, using Task 10's components. The product page includes Product JSON-LD (`name`, `description`, `image`, `offers.price` as a dollars string, `priceCurrency "USD"`, `availability InStock`) and a "What's included" list (file names and sizes, no links).
- [ ] **Step 2:** Implement the API routes as thin adapters (parse, call lib, map errors).
- [ ] **Step 3:** The success page polls the status every 2s for up to 60s. When paid, it calls `clearCart()` and shows "Check your email". On timeout it shows "Payment received? Your email may take a minute — or sign in to your Library."
- [ ] **Step 4:** Verify with `npm run build`, then run locally with `wrangler dev` and `.dev.vars` holding Stripe test keys. Use `stripe listen --forward-to localhost:8787/api/stripe/webhook` and buy with card `4242 4242 4242 4242`. Expected: order paid in D1 (`wrangler d1 execute DB --local --command "select status from orders"`).
- [ ] **Step 5:** Commit: `feat: storefront, cart and Stripe checkout flow`.

### Task 12: Account and Library

**Files:** Create `src/middleware.ts`, `src/pages/account/login.astro`, `src/pages/api/auth/request.ts`, `src/pages/auth/verify.ts`, `src/pages/account/logout.ts`, `src/pages/library.astro`, `src/pages/download/[fileId].ts`.

**Interfaces:**
- Consumes: `getSessionCustomer`, `requestLogin`, `verifyLogin`, `sessionCookie`, `clearSessionCookie`, `destroySession`, `listLibrary`, `authorizeDownload`, `verifyAdmin`.
- Middleware sets `locals.customer` from the cookie. For `/admin*` and `/api/admin*` it calls `verifyAdmin` and returns 403 when that fails, otherwise sets `locals.adminEmail`. For non-GET requests to `/api/admin*` and `/admin*` it rejects an `Origin` that differs from `SITE_URL` with 403.
- `/auth/verify` sets the cookie and 303-redirects to `/library`. An invalid token redirects to `/account/login?error=expired`.
- `/library` without a session redirects to `/account/login`.
- `/download/:fileId`: no session returns 302 to login. `NOT_FOUND` or `NOT_ENTITLED` returns 404. `RATE_LIMITED` returns 429 with a friendly page. Otherwise it streams `FILES.get(file.r2Key)` with `Content-Disposition: attachment; filename*=UTF-8''<encoded displayName>` and `Cache-Control: private, no-store`.

- [ ] **Step 1:** Implement the pages and routes in the Task 10 style. The login page always shows "If you've bought from us, a sign-in link is on its way."
- [ ] **Step 2:** Verify locally: after the test purchase from Task 11, open the emailed link (Resend sandbox delivers to the owner address, or log the link in dev when `ENVIRONMENT=development`), see the Library, download the file, and confirm the 21st download returns 429.
- [ ] **Step 3:** Commit: `feat: customer login, library and secure downloads`.

### Task 13: Admin

**Files:** Create `src/pages/admin/index.astro`, `src/pages/admin/products/index.astro`, `src/pages/admin/products/[id].astro` (`new` = create), `src/pages/api/admin/products.ts` (POST save), `src/pages/api/admin/products/[id]/delete.ts`, `src/pages/api/admin/products/[id]/files.ts` (POST upload multipart, DELETE remove), `src/pages/admin/orders/index.astro`, `src/pages/admin/orders/[id].astro`, `src/pages/api/admin/orders/[id]/resend.ts`.

**Interfaces:**
- Consumes: product and order repos, `parseUsdToCents`, `issueLoginLink` (72h), `orderConfirmationEmail`, `ResendMailer`.
- Uploads: deliverables go to `products/<productId>/<uuid>-<safeName>` and covers go to `covers/<productId>/<uuid>-<safeName>`. Covers are limited to 5 MB (`image/*`) and deliverables to 100 MB (Workers request limit on the free plan). Bigger files: see the README note on `wrangler r2 object put`, then "register existing R2 key" in the form.
- Removing a file deletes its R2 object only if no order exists for that product. Otherwise it only unlinks it from the product listing, and keeps it for existing buyers (add `product_files.archived_at`; `listLibrary` still shows archived files, while the "what's included" list hides them). **Requires migration `0002_file_archive.sql`. Add a test to `tests/downloads.test.ts`: `archived file still downloadable by buyer`.**

- [ ] **Step 1:** Write the failing test `archived file still downloadable by buyer`. Run it and expect FAIL. Add migration 0002 and `archiveFile(db, fileId)`, then run and expect PASS.
- [ ] **Step 2:** Implement the admin pages (plain server-rendered forms, `Admin.astro` layout): dashboard counts (products, paid orders, revenue for the last 30 days via `formatUsd`), the product form with validation messages, and order list and detail with a link to `https://dashboard.stripe.com/payments/<payment_intent>`.
- [ ] **Step 3:** Verify locally with `DEV_ADMIN_BYPASS=true`: create a product with a cover and a file, publish it, see it in the shop, buy it, see the order in admin, and resend the email.
- [ ] **Step 4:** Commit: `feat: admin for products, files and orders`.

### Task 14: Legal, info and SEO pages

**Files:** Create `src/pages/{about,contact,terms,privacy,refund-policy}.astro`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts`.

- [ ] **Step 1:** Write the legal templates with `[BUSINESS NAME]`, `[ADDRESS]`, `[CONTACT EMAIL]` and `[REFUND WINDOW]` placeholders, and a visible top notice "Template — replace placeholders and have it reviewed." The privacy page lists the data stored (email, order history, download log with a hashed IP) and the processors (Stripe, Cloudflare, Resend).
- [ ] **Step 2:** The sitemap includes the home, shop, published products and info pages, using absolute URLs from `SITE_URL`. `robots.txt` disallows `/admin`, `/api`, `/library`, `/download` and `/auth`, and links the sitemap.
- [ ] **Step 3:** Verify with `npm run build` and by opening `/sitemap.xml` in dev.
- [ ] **Step 4:** Commit: `feat: legal templates, sitemap and robots`.

### Task 15: Deployment pipeline, docs, push

**Files:** Create `.github/workflows/deploy.yml`, `README.md`, `.env.example`, `.dev.vars.example`, `docs/launch-checklist.md`. Modify `wrangler.jsonc` (final bindings).

- [ ] **Step 1:** Write `deploy.yml`. Job `test` runs on `push` and `pull_request` (Node 22, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`). Job `deploy` runs `needs: test` with `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, then `npx wrangler d1 migrations apply DB --remote` and `npx wrangler deploy`, with env `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from secrets.
- [ ] **Step 2:** Write the README: what it is, local setup (`npm i`, copy `.dev.vars.example`, `npm run db:migrate:local`, `npm run dev`), first-time Cloudflare setup step by step (`wrangler login`; `wrangler d1 create shelfmade-db` and paste the id into `wrangler.jsonc`; `wrangler r2 bucket create shelfmade-files`; `wrangler secret put` for each secret; the Access application for `/admin*` and `/api/admin*`; creating an API token with the Workers Scripts, D1 and R2 edit permissions; adding the GitHub secrets), the Stripe webhook setup (endpoint `https://<site>/api/stripe/webhook` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`), and adding products.
- [ ] **Step 3:** Write `docs/launch-checklist.md`: Stripe (activate account, live keys, live webhook, test a real $1 purchase then refund it, statement descriptor, Stripe Tax decision), domain/DNS (register it, add it as a Worker custom domain, update `SITE_URL`, update the Stripe webhook URL and the Access app), email (verify the domain in Resend with SPF/DKIM, set `EMAIL_FROM`, send a test), legal (replace placeholders, refund policy matches practice, footer links), security (Access policy is only the owner, `DEV_ADMIN_BYPASS` unset in production, R2 bucket has no public access), and content (at least 3 products, covers, About page).
- [ ] **Step 4:** Run the full verification: `npm run typecheck && npm test && npm run build`. Expected: all pass with 0 type errors.
- [ ] **Step 5:** Commit: `ci: GitHub Actions deploy to Cloudflare; docs and launch checklist`. Then `git branch -M main` and `git push -u origin main`. If the push fails for authentication, give the owner the exact commands to run.
