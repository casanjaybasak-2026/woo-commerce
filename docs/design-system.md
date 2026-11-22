# Shelfmade Design System

A clean, light storefront in the spirit of the Astra WordPress theme: white
space, a calm sticky header, a centred content column, simple card grids and one
clear call to action per view. The source of truth for values is
`src/styles/tokens.css`. Components never use raw hex values. They use the tokens.

> Built from the ui-ux-pro-max skill's built-in rules (accessibility, touch,
> performance, layout, type and colour priorities). The skill's searchable
> database was unavailable in this session, so the palette and type choices
> below are general defaults rather than database matches.

## 1. Principles

1. **Content first.** Product covers and titles carry the page. Chrome stays quiet.
2. **One primary action per view.** "Add to cart", "Checkout", "Open Library" are
   the only filled buttons on their pages.
3. **Trust signals near money.** Price, "instant download", secure checkout and
   refund-policy links sit next to buy buttons.
4. **Fast and steady.** System fonts, no layout shift (cover images reserve a
   4:3 aspect ratio), minimal JavaScript (cart and success polling only).
5. **Accessible by default.** WCAG AA contrast, visible focus, 44px targets,
   labelled fields, and errors next to the field.

## 2. Colour

| Token | Value | Use | Contrast on white |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` | Page background | — |
| `--color-surface` | `#F6F7F9` | Section bands, footer, admin background | — |
| `--color-surface-2` | `#EEF1F5` | Placeholders, hover rows | — |
| `--color-border` | `#E5E7EB` | Card and input borders, dividers | — |
| `--color-border-strong` | `#D1D5DB` | Input borders | — |
| `--color-text` | `#1F2937` | Body and headings | 14.7:1 |
| `--color-text-muted` | `#5B6472` | Secondary text, meta | 6.1:1 |
| `--color-accent` | `#2F5BEA` | Primary buttons, links, focus | 5.6:1 |
| `--color-accent-hover` | `#2448C0` | Hover and pressed | 7.6:1 |
| `--color-accent-soft` | `#EAF0FF` | Badges, selected filters | — |
| `--color-on-accent` | `#FFFFFF` | Text on accent | 5.6:1 |
| `--color-success` / `-soft` | `#15803D` / `#E8F6EE` | Paid, success notices | 5.0:1 |
| `--color-warning` / `-soft` | `#A15C07` / `#FDF3E2` | Template and legal notices | 5.2:1 |
| `--color-danger` / `-soft` | `#B91C1C` / `#FDECEC` | Errors, destructive actions | 6.5:1 |
| `--color-sale` | `#B91C1C` | Compare-at price (struck through) | 6.5:1 |

Colour is never the only signal. Status badges also carry text, and errors carry
an icon and a message.

## 3. Typography

- Font: the system UI stack (`-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, "Helvetica Neue", Arial, sans-serif`). It loads instantly, needs no
  third-party font requests and looks native, as Astra's defaults do.
- Base 16px (`1rem`), body line height 1.65, headings 1.2.
- Scale (rem): `--text-xs .8125`, `--text-sm .875`, `--text-base 1`, `--text-lg 1.125`,
  `--text-xl 1.375`, `--text-2xl 1.75`, `--text-3xl 2.25`, `--text-4xl clamp(2.25rem, 4vw + 1rem, 3.25rem)`.
- Weights: 400 body, 600 UI and labels, 700 headings and prices.
- Measure: long-form text (product descriptions, legal pages) is capped at 70ch.

## 4. Spacing, radius, shadow, layout

- Spacing (4px base): `--space-1 .25rem` … `--space-10 6rem`
  (`.25, .5, .75, 1, 1.5, 2, 3, 4, 5, 6` rem).
- Radius: `--radius-sm 6px` (inputs, badges), `--radius 10px` (buttons, cards),
  `--radius-lg 16px` (hero media, panels), `--radius-pill 999px`.
- Shadow: `--shadow-sm` for resting cards (barely there) and `--shadow-md` for
  hovered cards and the cart badge popover. No heavy drop shadows.
- Container: `--container 1200px` with `--gutter clamp(1rem, 4vw, 2rem)` side
  padding. Narrow container `--container-narrow 760px` for cart, login and legal pages.
- Breakpoints (mobile-first): `640px` (2-column grids), `960px` (3-column grids,
  product page two-column), `1200px` (4-column grids on Shop when there's room).

## 5. Components

| Component | Spec |
|---|---|
| **Header** | Sticky, white, 1px bottom border, 64px tall. Logo (text, 700, `--text-xl`) on the left; nav (Shop, Library, About) and a cart button with a count badge on the right. On mobile, nav collapses into a `<details>` disclosure menu (no JavaScript). |
| **Footer** | `--color-surface` band: store blurb, link columns (Shop / Help / Legal), copyright. |
| **Button** | Min height 44px, padding `.75rem 1.25rem`, radius `--radius`, weight 600. Variants: `primary` (accent fill), `secondary` (white, border), `ghost` (text only), `danger`. Disabled is 55% opacity with `cursor: not-allowed`. Loading uses `aria-busy="true"` plus a spinner. |
| **Product card** | Whole card is one link. 4:3 cover (with a fallback gradient tile showing initials when there's no cover), category eyebrow (`--text-xs`, uppercase, muted), title (600, 2-line clamp), short description (muted, 2-line clamp), price row. Hover lifts with `--shadow-md` and translates up 2px (disabled under reduced motion). |
| **Price** | 700 weight. Compare-at price shown struck through in muted text, with a "Save X%" badge in `--color-sale`. |
| **Badge** | Pill, `--text-xs`, 600. Tones: neutral, accent, success, warning, danger. |
| **Notice** | Left 4px border plus soft background. Tones: info, success, warning, danger. Has `role="status"` (or `role="alert"` for errors). |
| **Form field** | Label above (600, `--text-sm`), input 44px min height, 1px `--color-border-strong`, radius `--radius-sm`. Focus ring is a 3px accent ring. Help text sits below in muted text. Errors sit below in danger colour with `aria-describedby`. |
| **Empty state** | Centred icon, one-line title, one sentence, one button. |
| **Table (admin)** | Zebra-free, row dividers, sticky header on scroll, right-aligned numbers. |

Icons are inline SVG (stroke 1.75, 20px, `currentColor`, `aria-hidden` when
decorative). No emoji as icons.

## 6. Page patterns

- **Home:** hero (headline, subline, primary "Browse the shop" and secondary
  "How it works"), featured grid (up to 8), category tiles, a 3-step "How it
  works" (Buy → Get email → Download any time), a trust strip (secure Stripe
  checkout, instant delivery, refund policy) and an FAQ (native
  `<details>`).
- **Shop:** page title and count. Filter row: category chips (links, so they
  work without JavaScript), a search input and a sort select (GET form). Grid
  of 1/2/3/4 columns.
- **Product:** two columns at ≥960px. Left is the cover. Right has the
  category, title, price, short description, a primary "Add to cart" button, a
  secondary "Buy now", and a trust list (instant download, secure checkout,
  lifetime access to your Library). Below come the long description (prose)
  and "What's included" (file names and sizes).
- **Cart:** narrow container, line items (thumb, title, price, remove), a
  summary card (subtotal, "Taxes and discount codes at checkout"), and a
  primary "Checkout securely" button.
- **Success:** a centred status card that polls, moving from a spinner to a
  success check. Copy follows the plan.
- **Login:** narrow card, one email field and one button. The confirmation
  message is the same whether or not the email exists.
- **Library:** a list of owned products, each a card with its files and
  download buttons, plus file size. Empty state links to Shop.
- **Admin:** a separate simple layout with a sidebar nav (Dashboard, Products,
  Orders, View store) on `--color-surface`, and white content panels.
- **Legal:** narrow prose page with a warning notice at the top while
  placeholders remain.

## 7. Motion

- Durations: `--dur-fast 120ms` (hover colour), `--dur 200ms` (lift, menu).
  Easing: `cubic-bezier(.2,.7,.2,1)`.
- Only `transform`, `opacity`, `color` and `background-color` animate.
- `@media (prefers-reduced-motion: reduce)` turns off transforms and transitions.

## 8. Accessibility checklist

- A skip link to `#main`, landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page.
- `:focus-visible` ring `0 0 0 3px var(--color-focus)` on every interactive element.
- Every image has `alt`. Covers use the product title, and decorative images use `alt=""`.
- The cart count updates an `aria-live="polite"` region.
- Touch targets are at least 44×44px, with at least 8px between adjacent targets.
- Viewport meta, with no zoom lock. No horizontal scroll at 320px.
