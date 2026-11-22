import Stripe from "stripe";

export interface CheckoutLineItem {
  quantity: number;
  price_data: {
    currency: string;
    unit_amount: number;
    product_data: { name: string; metadata?: Record<string, string> };
  };
}

export interface CheckoutSessionParams {
  mode: "payment";
  line_items: CheckoutLineItem[];
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  metadata: Record<string, string>;
  allow_promotion_codes: boolean;
  customer_creation?: "always" | "if_required";
  automatic_tax?: { enabled: boolean };
}

export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: any };
}

export interface PaymentGateway {
  createCheckoutSession(p: CheckoutSessionParams): Promise<{ id: string; url: string }>;
  constructEvent(rawBody: string, signature: string): Promise<StripeEventLike>;
}

export class StripeGateway implements PaymentGateway {
  private stripe: Stripe;
  constructor(secretKey: string, private webhookSecret: string) {
    this.stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
  }

  async createCheckoutSession(p: CheckoutSessionParams) {
    const s = await this.stripe.checkout.sessions.create(p as Stripe.Checkout.SessionCreateParams);
    if (!s.url) throw new Error("Stripe did not return a checkout URL");
    return { id: s.id, url: s.url };
  }

  async constructEvent(rawBody: string, signature: string): Promise<StripeEventLike> {
    const ev = await this.stripe.webhooks.constructEventAsync(
      rawBody, signature, this.webhookSecret, undefined, Stripe.createSubtleCryptoProvider(),
    );
    return ev as unknown as StripeEventLike;
  }
}
