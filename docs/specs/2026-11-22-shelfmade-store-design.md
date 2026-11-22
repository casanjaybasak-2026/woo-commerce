# Shelfmade — Digital Products Store: Design

Date: 2026-11-22
Status: Draft, awaiting owner approval

## 1. Intent

The owner wants their own Shopify-like store, in their own code, to sell digital
products (and later courses). It runs entirely on Cloudflare, the code lives in
GitHub (`casanjaybasak-2026/woo-commerce`), and every push to `main` deploys
automatically. The look is clean and light in the style of the Astra WordPress
theme: lots of white space, a simple header, card grids and readable type.

They chose custom code over WooCommerce + Astra so that they own the stack, avoid
WordPress hosting and plugins, and get Cloudflare's speed and low cost.

## 2. Goals

- A buyer can browse, add products to a cart, pay with Stripe (USD) and get their
  files right away. Paying starts from a working store, not a checklist of steps.
- Purchased files can only be downloaded by the buyer who paid, and only from
  links that expire.
- The owner can add and edit products, upload files, publish or unpublish
  products, and see orders without touching code.
- Deploys happen from GitHub to Cloudflare with no manual steps after the
  first-time setup.
- Fast and SEO-friendly: server-rendered HTML, minimal JavaScript, Product
  structured data.

## 3. Non-goals (v1)

- Video courses and lesson players. The data model leaves room for them, but
  there is no video hosting in v1.
- Subscriptions, memberships and licence keys.
- Multi-currency, Razorpay and other gateways.
- Shopify-level analytics, discount engine, reviews and affiliates. Coupons
  are available through Stripe promotion codes only.
- Physical products, shipping and inventory.
- Multiple admin users with different roles.

## 4. Anti-goals (a failure even if it "works")

- A paid file can be reached by URL without paying (for example a public R2
  bucket, guessable links or links that never expire).
- The price charged comes from the browser rather than the database.
- Card data passes through or is stored by our code.
- `/admin` can be reached by anyone other than the owner.
- An order is marked paid from the success-page redirect instead of a verified
  Stripe webhook.
- The owner has to edit code to add a product.

## 5. Constraints

- Hosting is Cloudflare Workers (with static assets), D1 (SQLite), R2 (object
  storage) and Cloudflare Access. Everything must run on the Workers runtime:
  no Node-only APIs, and the Web Crypto API is used for hashing and signing.
- There is no custom domain yet. v1 is served from `*.workers.dev`, and a
  domain can be added later without code changes (`SITE_URL` env var).
- Payments are Stripe Checkout (hosted) in USD. The owner has an active Stripe
  account.
- Email is sent with Resend's HTTP API. **Resend can only send to arbitrary
  customers from a verified domain**, so customer email needs a domain before
  launch (see §12).
- The repo is in a OneDrive-synced folder. `node_modules`, `.wrangler` and
  `dist` are git-ignored.
- The project is maintained by one person, so prefer few moving parts.

## 6. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. One Astro app on Workers** (storefront, API, admin in one project; Cloudflare Access protects admin) | One repo and one deploy. Admin is simple forms, not a Shopify dashboard | **Chosen** — least to maintain, and admin login is handled by Cloudflare rather than custom password code |
| B. Static Astro on Pages + separate Worker API | Clean split, but two deploys to configure and keep in sync | Rejected: extra moving parts with no benefit for a one-person store |
| C. Catalog managed in Stripe's dashboard | Less admin code, but files still need their own upload UI, so two places to manage, and the catalog is tied to Stripe | Rejected |

## 7. Decided by the owner

- Name: **Shelfmade**
- Stack: **Astro + Cloudflare Workers**, D1 for data, R2 for files
- Payments: **Stripe Checkout, USD**
- Delivery: **customer account area**: a passwordless email login link and a
  "My Library" page, plus a receipt email
- Content: **downloadable files only** in v1 (no video)
- Hosting: Cloudflare, `workers.dev` address to start
- Repo: `https://github.com/casanjaybasak-2026/woo-commerce.git`
- Project folder: current OneDrive folder
- Look: Astra-like and clean (the design system is defined in the next phase)

## 8. Feature list

### Storefront (public)
- **Home**: hero with call to action, featured products, category tiles, a
  "why buy here" strip, an FAQ teaser and the footer.
- **Shop / catalog**: grid of published products, filter by category, simple
  text search, sort by newest or price.
- **Product page**: cover image and gallery, title, price (with an optional
  compare-at price shown struck through), short and long description (Markdown),
  "what's included" file list (names and sizes only), add to cart, buy now, and
  Product JSON-LD.
- **Cart**: line items (digital, so quantity is fixed at 1 per product),
  remove, subtotal, checkout button. Stored in `localStorage` and shown in a
  header badge.
- **Checkout**: redirects to Stripe Checkout. Email is collected by Stripe and
  promotion codes are allowed.
- **Order success**: waits for webhook confirmation, then says "Check your
  email" with a link to the Library.
- **Account**: `/account/login` (enter email to get a link), `/library`
  (purchased products with download buttons), logout.
- **Legal and info**: Terms, Privacy, Refund Policy, Contact, About. These are
  templates with clearly marked placeholders.
- 404 page, `sitemap.xml`, `robots.txt`, Open Graph tags.

### Admin (`/admin`, behind Cloudflare Access)
- Dashboard: counts (products, paid orders, revenue in the last 30 days),
  recent orders.
- Products: list, create, edit, publish/unpublish, delete (soft delete if any
  orders exist).
  - Fields: title, slug (auto from title, editable), category, short
    description, long description (Markdown), price (USD), compare-at price,
    cover image, published flag, sort order.
  - Files: upload one or more deliverable files to R2 (private), rename the
    display name, remove.
- Orders: list with status filter, order detail (items, email, Stripe link),
  "resend access email".
- Refunds are done in the Stripe dashboard. The `charge.refunded` webhook
  revokes access automatically.

### Emails (Resend)
- **Order confirmation**: items, total, and a login link that opens the Library.
- **Login link**: a single-use link that expires in 15 minutes.

## 9. How it works

### Data (D1)
- `products` (id, slug unique, title, category, short_desc, long_desc_md,
  price_cents, compare_at_cents, cover_key, published, sort, created_at,
  updated_at, deleted_at)
- `product_files` (id, product_id, r2_key, display_name, size_bytes,
  content_type, created_at)
- `customers` (id, email unique (lower-cased), created_at)
- `orders` (id, public_id, customer_email, customer_id, status
  `pending|paid|refunded|expired`, subtotal_cents, discount_cents, total_cents,
  currency, stripe_session_id unique, stripe_payment_intent, created_at,
  paid_at)
- `order_items` (id, order_id, product_id, title_snapshot, price_cents_snapshot)
- `entitlements` (id, customer_id, product_id, order_id, revoked_at); unique per
  (customer, product, order)
- `login_tokens` (token_hash, email, expires_at, used_at)
- `sessions` (session_hash, customer_id, expires_at)
- `download_events` (id, entitlement_id, file_id, at, ip_hash) used for rate
  limiting
- `stripe_events` (event_id primary key, processed_at) used for idempotency
- Schema changes are SQL migration files applied by `wrangler d1 migrations`.

### Files (R2)
- One **private** bucket. Keys look like `products/<productId>/<uuid>-<name>`.
- Cover images are served through `/media/<key>` with long cache headers. Only
  keys under `covers/` are served; everything else returns 404.
- Downloads go through `/download/<fileId>`, which checks the session, the
  entitlement (not revoked) and the rate limit (default 20 downloads per file
  per 24h per customer), then streams from R2 with `Content-Disposition:
  attachment`. There are never public or permanent file URLs.

### Checkout flow
1. The browser posts cart product IDs to `POST /api/checkout`.
2. The server loads products from D1 (published, not deleted) and ignores any
   price from the client. It builds a `pending` order with item snapshots, then
   creates a Stripe Checkout Session (`mode=payment`, `price_data` per line,
   `allow_promotion_codes`, `metadata.order_id`, success and cancel URLs). It
   saves `stripe_session_id` and returns the URL.
3. Stripe redirects back to `/checkout/success?order=<public_id>`, which polls
   `/api/orders/<public_id>/status` until it's paid. It never marks anything
   paid itself.
4. `POST /api/stripe/webhook` verifies the signature (Stripe SDK
   `constructEventAsync` with Web Crypto). It is idempotent through
   `stripe_events`.
   - `checkout.session.completed` with `payment_status=paid`, or
     `checkout.session.async_payment_succeeded`: upsert the customer, mark the
     order `paid` with final amounts from the session, create entitlements, and
     send the confirmation email.
   - `checkout.session.expired`: mark the order `expired`.
   - `charge.refunded` (full refund): mark the order `refunded` and revoke its
     entitlements.

### Customer login
- `POST /api/auth/request` with an email: always responds "check your email",
  so it doesn't reveal whether the email exists. It creates a 32-byte random
  token, stores only its SHA-256 hash with a 15-minute expiry, and emails
  `/auth/verify?token=…`. It is rate-limited per email and per IP.
- `/auth/verify` checks the hash, unused status and expiry, marks the token
  used, creates a session (random token, hash stored, 30 days), and sets a
  `__Host-` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`).
- A buyer who pays has no account step. The confirmation email's link logs
  them in.

### Admin protection
- A Cloudflare Access application covers `/admin*` and `/api/admin*`, with the
  policy "email is the owner's address".
- Defence in depth: middleware also verifies the `Cf-Access-Jwt-Assertion` JWT
  (signature from the team's JWKS, audience tag) and checks `ADMIN_EMAILS`. In
  local dev only, `DEV_ADMIN_BYPASS=true` skips this. It is refused if
  `ENVIRONMENT=production`.
- Admin forms that change data use POST, with a same-origin check.

### Config
- `wrangler.jsonc`: bindings `DB` (D1), `FILES` (R2), static assets, and vars
  `SITE_URL`, `STORE_NAME`, `ENVIRONMENT`, `CURRENCY=usd`.
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `ADMIN_EMAILS`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.
  `.env.example` and `.dev.vars.example` document all of them.

### Deploy pipeline (GitHub Actions)
- On a pull request or a push to any branch: install, typecheck, test, build.
- On a push to `main`: the same steps, then `wrangler d1 migrations apply
  --remote` and `wrangler deploy`. Repo secrets: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`. App secrets are set once with `wrangler secret put`.

### Testing (TDD for core logic)
- Vitest. The core logic is pure TypeScript modules with tests written first:
  cart normalising and pricing, building the checkout session request, webhook
  event handling (state transitions, idempotency, refunds), entitlement and
  download authorisation (including the rate limit), and login token and
  session lifecycle.
- The D1 data layer is tested against a real local D1 through
  `@cloudflare/vitest-pool-workers` (Miniflare).
- Stripe and Resend sit behind small interfaces, so tests use fakes. There are
  no network calls in tests.

## 10. Left to the builder

- Exact component breakdown, CSS approach and file layout, which follow the
  design system phase.
- Markdown renderer choice (it must be Workers-compatible and sanitised).
- Admin UI details (plain server-rendered forms are fine; no SPA).
- Image handling: covers are uploaded as-is. Resizing is out of scope for v1.

## 11. Calls made by Claude (owner may override)

- Cart lives in `localStorage`, and the server re-prices everything.
- Quantity is fixed at 1 per digital product.
- Coupons use Stripe promotion codes rather than custom code.
- Download limit: 20 per file per 24h per customer.
- Login link expires in 15 minutes, and sessions last 30 days.
- Stripe Tax is off by default and can be switched on with an env flag
  (`STRIPE_AUTOMATIC_TAX=true`) once registered.
- Legal pages ship as templates with `[PLACEHOLDER]` text for business name,
  address, contact email and refund terms. They are not legal advice.
- Resend is the email provider.

## 12. Open item for the owner

- **A domain is needed for customer email.** Without a verified domain,
  Resend only delivers to the owner's own address. The store can be built,
  deployed and fully tested on `workers.dev` now. Before taking real orders, the
  owner should register a domain (Cloudflare Registrar, about $10/year) and
  verify it in Resend. The launch checklist covers this step.
