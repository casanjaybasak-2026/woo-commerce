# Shelfmade

A fast, Shopify-style store for **digital products**, written in plain code and
hosted entirely on **Cloudflare**.

- **Storefront:** home, shop (search, categories, sort), product pages, cart and success page
- **Checkout:** Stripe Checkout in USD, with card details never touching the server and promo codes supported
- **Delivery:** buyers get an emailed sign-in link (no passwords) and a **My Library** page with secure, rate-limited downloads
- **Admin** (`/admin`): products, cover images, file uploads and orders, protected by Cloudflare Access
- **Automatic access control:** only a verified Stripe webhook marks orders paid, and a full refund removes access
- **Deploys:** every push to `main` is tested and deployed by GitHub Actions

| Piece | Technology |
|---|---|
| App | [Astro 7](https://astro.build) (server-rendered) on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite), schema in `migrations/` |
| Files | Cloudflare R2 (private bucket) |
| Payments | Stripe Checkout and webhooks |
| Email | Resend |
| Admin login | Cloudflare Access (Zero Trust, free for up to 50 users) |
| Tests | Vitest, with real SQLite running the same migrations |

```
src/
  lib/            business logic (framework-free, unit tested)
    cart.ts checkout.ts webhook.ts downloads.ts money.ts markdown.ts
    auth/         login links, sessions, tokens
    admin/        Access JWT check, product form validation
    db/           D1 queries (products, orders, customers)
    email/        Resend mailer and templates
  pages/          routes (thin adapters over lib/)
  components/ layouts/ styles/   UI (see docs/design-system.md)
migrations/       D1 schema
tests/            Vitest suites
docs/             spec, plan, design system, launch checklist
```

---

## 1. Run it locally

You need Node 22.5 or newer.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Open http://localhost:4321. With `DEV_ADMIN_BYPASS=true` in `.dev.vars`,
http://localhost:4321/admin opens without Cloudflare Access, so you can add a
product right away.

- Leave `RESEND_API_KEY` empty locally. Emails, including sign-in links, are then
  printed in the terminal instead of being sent.
- To test real checkout locally, put your Stripe **test** secret key in
  `.dev.vars`, install the [Stripe CLI](https://docs.stripe.com/stripe-cli), and run:

```bash
stripe listen --forward-to localhost:4321/api/stripe/webhook
```

Copy the `whsec_…` value it prints into `STRIPE_WEBHOOK_SECRET` in `.dev.vars`,
restart `npm run dev`, and pay with the test card `4242 4242 4242 4242` (any
future date, any CVC).

Run the tests and type check:

```bash
npm test
```

```bash
npm run typecheck
```

---

## 2. First-time Cloudflare setup (about 20 minutes, once)

You need a free Cloudflare account. All commands run from this folder.

**2.1 Log in to Wrangler**

```bash
npx wrangler login
```

**2.2 Create the database.** Copy the `database_id` it prints into
`wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.

```bash
npx wrangler d1 create shelfmade-db
```

**2.3 Create the file bucket.** It is private by default. Don't enable public access.

```bash
npx wrangler r2 bucket create shelfmade-files
```

**2.4 Apply the database schema**

```bash
npm run db:migrate:remote
```

**2.5 First deploy.** This prints your address, for example
`https://shelfmade.<your-subdomain>.workers.dev`.

```bash
npm run deploy
```

Put that address in `wrangler.jsonc` → `vars.SITE_URL`.

**2.6 Protect `/admin` with Cloudflare Access**

1. Cloudflare dashboard → **Zero Trust** (choose the Free plan and a team name if asked).
2. **Access → Applications → Add an application → Self-hosted**.
3. Application domain: your `workers.dev` host, with paths `admin` and `api/admin`
   (add both). Session duration: 24h.
4. Policy: **Allow**, Include → **Emails** → your email address.
5. Save, then open the application's **Overview** and copy the **Application Audience (AUD) tag**.
6. Your team domain is `<team-name>.cloudflareaccess.com`.

**2.7 Set the secrets.** Each command prompts for the value.

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

```bash
npx wrangler secret put RESEND_API_KEY
```

```bash
npx wrangler secret put EMAIL_FROM
```

```bash
npx wrangler secret put ADMIN_EMAILS
```

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
```

```bash
npx wrangler secret put CF_ACCESS_AUD
```

| Secret | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (`sk_test_…` while testing, `sk_live_…` at launch) |
| `STRIPE_WEBHOOK_SECRET` | From step 2.8 (`whsec_…`) |
| `RESEND_API_KEY` | resend.com → API Keys |
| `EMAIL_FROM` | e.g. `Shelfmade <orders@yourdomain.com>` (the domain must be verified in Resend) |
| `ADMIN_EMAILS` | Your email (comma-separate several) |
| `CF_ACCESS_TEAM_DOMAIN` | `<team-name>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | The AUD tag from step 2.6 |

**2.8 Stripe webhook.** Stripe → Developers → **Webhooks → Add endpoint**:

- URL: `https://<your-site>/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.expired`, `charge.refunded`
- Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET` (step 2.7).

**2.9 Connect GitHub for automatic deploys**

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token** → start from
   the **Edit Cloudflare Workers** template, then **add** the permissions
   *Account → D1 → Edit* and *Account → Workers R2 Storage → Edit*. Create it and copy the token.
2. Find your **Account ID** on the Workers & Pages overview page (right sidebar).
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Commit the `wrangler.jsonc` changes (database id, `SITE_URL`) and push to `main`.
   The **Test and deploy** workflow runs tests, applies migrations and deploys.

From now on: **edit, commit, push to `main`, and it's live**. Pull requests and other
branches run the tests only.

---

## 3. Adding products

1. Open `https://<your-site>/admin` and sign in with the one-time code Cloudflare emails you.
2. **Products → Add product**: title, price, optional compare-at price, category,
   short and full description (Markdown) and a cover image (4:3, up to 5 MB).
   Tick **Published** when it's ready.
3. Save, then use **Files buyers receive** to upload the deliverables (up to 100 MB each).

**Files over 100 MB:** upload them with Wrangler, then use "Register a large file"
on the product page. Use the product id shown in the placeholder:

```bash
npx wrangler r2 object put shelfmade-files/products/<product-id>/my-course.zip --file ./my-course.zip --remote
```

**Refunds:** refund the payment in Stripe. A full refund automatically removes the
product from the buyer's Library. Partial refunds keep access.

**Resending access:** Admin → Orders → open the order → **Resend access email**.

---

## 4. How security works

- Prices are always read from the database at checkout. The browser only sends product ids.
- Orders become paid only when a **signature-verified** Stripe webhook arrives.
  Webhook retries are de-duplicated.
- Files live in a private R2 bucket. `/download/<id>` checks the signed-in buyer
  owns the product (and that it hasn't been refunded), allows 20 downloads per file
  per 24 hours, and streams the file. Only `covers/*` images are public.
- Sign-in links are single-use, store only a SHA-256 hash, and expire after 15
  minutes (72 hours for the link in the order receipt). Sessions last 30 days, using
  an `HttpOnly`, `Secure`, `__Host-` cookie.
- `/admin` requires Cloudflare Access **and** the app re-verifies the Access JWT and
  checks `ADMIN_EMAILS`. `DEV_ADMIN_BYPASS` is ignored when `ENVIRONMENT=production`.
- Cross-site form posts are blocked (Astro `checkOrigin`).

## 5. Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server on :4321 |
| `npm test` | Run the test suite |
| `npm run typecheck` | Astro and TypeScript checks |
| `npm run build` | Production build |
| `npm run deploy` | Build and deploy from your machine |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npx wrangler tail` | Live production logs |
| `npx wrangler d1 execute DB --remote --command "SELECT status, COUNT(*) FROM orders GROUP BY status"` | Query production data |

Before going live, work through [docs/launch-checklist.md](docs/launch-checklist.md).
