import { escapeHtml as e } from "../html";
import { formatUsd } from "../money";
import type { MailMessage } from "./mailer";

type Email = Omit<MailMessage, "to">;

// Colours mirror docs/design-system.md tokens (emails can't use CSS variables).
const C = { text: "#1F2937", muted: "#6B7280", border: "#E5E7EB", bg: "#F6F7F9", accent: "#2F5BEA" };

function layout(storeName: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.text}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:24px 32px;border-bottom:1px solid ${C.border};font-size:20px;font-weight:700">${e(storeName)}</td></tr>
<tr><td style="padding:28px 32px;font-size:16px;line-height:1.6">${inner}</td></tr>
</table>
<p style="color:${C.muted};font-size:12px;margin-top:16px">You received this email because of activity on ${e(storeName)}.</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${e(href)}" style="background:${C.accent};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${e(label)}</a></p>`;
}

export function orderConfirmationEmail(args: {
  storeName: string;
  siteUrl: string;
  order: { publicId: string; subtotalCents: number; discountCents: number; totalCents: number };
  items: Array<{ titleSnapshot: string; priceCentsSnapshot: number }>;
  loginUrl: string;
}): Email {
  const { storeName, siteUrl, order, items, loginUrl } = args;
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.border}">${e(i.titleSnapshot)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${C.border}">${formatUsd(i.priceCentsSnapshot)}</td></tr>`,
    )
    .join("");
  const discountRow = order.discountCents
    ? `<tr><td style="padding:6px 0;color:${C.muted}">Discount</td><td align="right" style="padding:6px 0;color:${C.muted}">-${formatUsd(order.discountCents)}</td></tr>`
    : "";
  const html = layout(
    storeName,
    `<h1 style="font-size:22px;margin:0 0 8px">Thanks for your order!</h1>
<p style="margin:0 0 20px;color:${C.muted}">Order <strong>${e(order.publicId)}</strong> is paid and your files are ready.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${rows}${discountRow}
<tr><td style="padding:10px 0;font-weight:700">Total</td><td align="right" style="padding:10px 0;font-weight:700">${formatUsd(order.totalCents)}</td></tr></table>
${button(loginUrl, "Open my Library")}
<p style="font-size:14px;color:${C.muted}">This button signs you in automatically and works for 72 hours. After that, sign in any time at <a href="${e(siteUrl)}/account/login" style="color:${C.accent}">${e(siteUrl)}/account/login</a> with this email address.</p>`,
  );
  const text = [
    `Thanks for your order from ${storeName}!`,
    ``,
    `Order ${order.publicId}`,
    ...items.map((i) => `- ${i.titleSnapshot}: ${formatUsd(i.priceCentsSnapshot)}`),
    ...(order.discountCents ? [`Discount: -${formatUsd(order.discountCents)}`] : []),
    `Total: ${formatUsd(order.totalCents)}`,
    ``,
    `Open your Library (signs you in, valid 72 hours):`,
    loginUrl,
    ``,
    `Later, sign in at ${siteUrl}/account/login with this email address.`,
  ].join("\n");
  return { subject: `Your ${storeName} order is ready`, html, text };
}

export function loginLinkEmail(args: { storeName: string; loginUrl: string }): Email {
  const { storeName, loginUrl } = args;
  const html = layout(
    storeName,
    `<h1 style="font-size:22px;margin:0 0 8px">Sign in to ${e(storeName)}</h1>
<p style="margin:0;color:${C.muted}">Click the button to open your Library. The link works once and expires in 15 minutes.</p>
${button(loginUrl, "Sign in")}
<p style="font-size:14px;color:${C.muted}">Didn't ask for this? You can ignore this email.</p>`,
  );
  const text = `Sign in to ${storeName}\n\nOpen this link to sign in (works once, expires in 15 minutes):\n${loginUrl}\n\nDidn't ask for this? Ignore this email.`;
  return { subject: `Your ${storeName} sign-in link`, html, text };
}
