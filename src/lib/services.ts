// Wires environment bindings into the framework-free modules.
import { ConsoleMailer, ResendMailer, type Mailer } from "./email/mailer";
import { getEnv } from "./env";
import { StripeGateway } from "./payments";
import { KvFileStore, type FileStore } from "./storage";

export function siteUrl(env: Env = getEnv()): string {
  return (env.SITE_URL || "http://localhost:4321").replace(/\/$/, "");
}

export function mailer(env: Env = getEnv()): Mailer {
  if (!env.RESEND_API_KEY) {
    // Never block an order on email config; log loudly so it shows in Workers logs.
    if (env.ENVIRONMENT === "production") console.error("[email] RESEND_API_KEY is not set: emails are only logged, not sent");
    return new ConsoleMailer();
  }
  return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM || `${env.STORE_NAME} <onboarding@resend.dev>`);
}

export function gateway(env: Env = getEnv()): StripeGateway {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  return new StripeGateway(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET ?? "");
}

export function files(env: Env = getEnv()): FileStore {
  return new KvFileStore(env.FILES);
}

export const now = () => new Date();

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
