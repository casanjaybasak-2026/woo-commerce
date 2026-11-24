/// <reference types="astro/client" />

import type { Customer } from "./lib/types";

declare global {
  interface Env {
    DB: D1Database;
    FILES: KVNamespace;
    ASSETS: Fetcher;
    SITE_URL: string;
    STORE_NAME: string;
    ENVIRONMENT: string;
    CURRENCY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    RESEND_API_KEY: string;
    EMAIL_FROM: string;
    ADMIN_EMAILS: string;
    CF_ACCESS_TEAM_DOMAIN: string;
    CF_ACCESS_AUD: string;
    DEV_ADMIN_BYPASS?: string;
    STRIPE_AUTOMATIC_TAX?: string;
  }

  namespace App {
    interface Locals {
      customer: Customer | null;
      adminEmail: string | null;
    }
  }
}

export {};
