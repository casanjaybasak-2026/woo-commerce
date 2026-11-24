# Shelfmade Launch Checklist

Work top to bottom. Each item is a box you can tick once it's done and checked.

## 1. Cloudflare and deploys
- [x] D1 database created and its id is in `wrangler.jsonc`
- [x] KV namespace `shelfmade-files` created for product files (private, free tier)
- [x] `npm run db:migrate:remote` applied
- [ ] GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` added
- [ ] A push to `main` shows a green **Test and deploy** run in GitHub Actions
- [x] `SITE_URL` in `wrangler.jsonc` is your real public address (`https://shelfmade.casanjaybasak.workers.dev` until a domain is added)

## 2. Admin security
- [ ] Cloudflare Access application covers **both** `/admin` and `/api/admin`
- [ ] The Access policy allows **only** your email
- [ ] Secrets `ADMIN_EMAILS`, `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set
- [ ] `DEV_ADMIN_BYPASS` is **not** set in production (`npx wrangler secret list` doesn't show it)
- [ ] Opening `/admin` in a private window asks for the Cloudflare login; a different email is refused

## 3. Payments (Stripe)
- [ ] Stripe account fully activated (business details, bank account for payouts, identity)
- [ ] Statement descriptor set (Settings → Public details), e.g. `SHELFMADE`
- [ ] **Test mode first:** with `sk_test_` and a test-mode webhook, buy with `4242 4242 4242 4242`.
      The order shows as paid in Admin, the email arrives, and the download works.
- [ ] Test a refund in test mode: after a full refund the product leaves the Library
- [ ] Switch to **live**: set `STRIPE_SECRET_KEY` to `sk_live_…`, create the **live**
      webhook endpoint (same URL and 4 events), and set its `STRIPE_WEBHOOK_SECRET`
- [ ] Make one real $1 purchase (a temporary $1 product), confirm delivery, then refund it in Stripe
- [ ] Tax decision made: register where required, enable Stripe Tax, and set
      `STRIPE_AUTOMATIC_TAX` to `"true"` in `wrangler.jsonc` (or leave it off if not needed yet)
- [ ] Optional: create promotion codes in Stripe (Products → Coupons). They work at checkout automatically

## 4. Domain and DNS
- [ ] Domain registered (Cloudflare Registrar sells at cost, about $10/year for `.com`), or
      an existing domain added to Cloudflare with its nameservers switched
- [ ] Worker custom domain added: Workers & Pages → `shelfmade` → Settings → Domains & Routes →
      Add → Custom domain → `yourdomain.com` (and `www` if you want it)
- [ ] `SITE_URL` updated to `https://yourdomain.com`, committed and pushed
- [ ] Stripe webhook endpoint URL updated to the new domain
- [ ] Cloudflare Access application updated to the new domain (`/admin` and `/api/admin`)
- [ ] SSL/TLS mode is **Full (strict)**, and **Always Use HTTPS** is on

## 5. Email (Resend)
- [ ] Domain added in Resend and the SPF, DKIM (and optional DMARC) DNS records added in
      Cloudflare DNS. Resend shows **Verified**
- [ ] `EMAIL_FROM` set to an address on that domain, e.g. `Shelfmade <orders@yourdomain.com>`
- [ ] `RESEND_API_KEY` set (a sending-only key is enough)
- [ ] The sign-in link email (from `/account/login`) and the order email both arrive in the
      inbox, not spam (check Gmail and Outlook)
- [ ] A real inbox exists for replies and support, e.g. `support@yourdomain.com` via
      Cloudflare Email Routing

## 6. Legal pages
- [ ] Every `[PLACEHOLDER]` replaced on Terms, Privacy, Refund policy, About and Contact
- [ ] Refund policy matches what you will actually do
- [ ] EU/UK digital-content withdrawal wording confirmed (if you sell there)
- [ ] Privacy policy lists the real processors (Stripe, Cloudflare, Resend) and your contact
- [ ] Remove the yellow "Template" notice: set `template={false}` on `<LegalPage>` in
      each page once it's final
- [ ] Footer links all work

## 7. Content and storefront
- [ ] At least 3 products published, each with a cover image (4:3), clear description and files
- [ ] Each product was test-downloaded from the Library
- [ ] Every file is 25 MB or smaller (free storage limit per file)
- [ ] Home page hero text adjusted to your niche (`src/pages/index.astro`)
- [ ] About page tells your story
- [ ] Check on a phone: home, shop, product, cart, checkout, success and Library
- [ ] `https://yourdomain.com/sitemap.xml` loads, then submit it in Google Search Console

## 8. After launch
- [ ] Watch the first orders in Admin and in `npx wrangler tail`
- [ ] Stripe → Webhooks shows successful (2xx) deliveries
- [ ] Back up the database occasionally (D1 also keeps 30 days of Time Travel):
      `npx wrangler d1 export shelfmade-db --remote --output backup.sql`
