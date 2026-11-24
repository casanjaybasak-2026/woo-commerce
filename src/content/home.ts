// ─────────────────────────────────────────────────────────────
//  HOME PAGE TEXT — edit the words here; the design updates itself.
//  Keep the quotes "..." around each piece of text.
// ─────────────────────────────────────────────────────────────

export const hero = {
  badge: "Instant digital downloads",
  title: "Practical digital products, ready the moment you buy.",
  subtitle:
    "Templates, guides and toolkits made to save you hours. Pay securely, get an email, and download from your Library any time.",
  primaryButton: { label: "Browse the shop", href: "/shop" },
  secondaryButton: { label: "How it works", href: "#how" },
  checks: ["Secure Stripe checkout", "Instant download", "Lifetime access"],
};

export const highlights = [
  { icon: "zap", title: "Instant delivery", text: "Your files are ready seconds after payment." },
  { icon: "lock", title: "Secure payments", text: "Checkout handled by Stripe. We never see your card." },
  { icon: "infinity", title: "Lifetime library", text: "Download your purchases again whenever you need." },
  { icon: "shield", title: "Fair refunds", text: "Something wrong with a file? We'll make it right." },
] as const;

export const benefits = {
  eyebrow: "Why Shelfmade",
  title: "Made to save you time, not add to your to-do list",
  text: "Every product is practical, polished and ready to use the same day. No fluff, no subscriptions, just files that do the job.",
  points: [
    "Ready-to-use files: open, edit and go",
    "Clear instructions included with every product",
    "One-time price, no monthly fees",
    "Free updates appear right in your Library",
  ],
  button: { label: "See all products", href: "/shop" },
};

export const steps = [
  { icon: "cart", title: "Choose & pay", text: "Add products to your cart and check out securely with Stripe." },
  { icon: "mail", title: "Check your email", text: "We send a receipt with a link that signs you straight in." },
  { icon: "download", title: "Download any time", text: "Your purchases live in your Library, ready whenever you are." },
] as const;

// Add real customer reviews here. The section stays hidden while this list is empty.
// Example: { quote: "Saved me a weekend of work!", name: "Priya S.", role: "Freelance designer" },
export const testimonials: Array<{ quote: string; name: string; role?: string }> = [];

export const about = {
  eyebrow: "About the creator",
  title: "Hi, I'm the maker behind Shelfmade",
  text: "I create the tools I wish I'd had: simple, well-designed digital products that help you get more done in less time. Every file is tested before it reaches the shelf.",
  button: { label: "Read our story", href: "/about" },
};

export const faqs = [
  { q: "How do I get my files?", a: "Right after payment we email you a link that signs you in to your Library, where every purchase can be downloaded." },
  { q: "Do I need an account?", a: "No password needed. Your email is your account: request a sign-in link any time from the Sign in page." },
  { q: "Can I download again later?", a: "Yes. Your purchases stay in your Library, so you can come back and download them again whenever you need." },
  { q: "Is checkout secure?", a: "Payments are handled by Stripe. Your card details never touch our servers." },
  { q: "What if a file doesn't work?", a: "Contact us with your order number and we'll fix it or refund you, as described in our refund policy." },
  { q: "Do you offer discounts?", a: "Occasionally! If you have a promo code, enter it on the Stripe checkout page." },
];

export const finalCta = {
  title: "Ready to save hours this week?",
  text: "Browse the shelf and get your first product in minutes.",
  button: { label: "Shop now", href: "/shop" },
};
