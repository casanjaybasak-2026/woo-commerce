export interface Product {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  shortDesc: string;
  longDescMd: string;
  priceCents: number;
  compareAtCents: number | null;
  coverKey: string | null;
  published: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductFile {
  id: string;
  productId: string;
  r2Key: string;
  displayName: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface Customer {
  id: string;
  email: string;
  createdAt: string;
}

export type OrderStatus = "pending" | "paid" | "refunded" | "expired";

export interface Order {
  id: string;
  publicId: string;
  customerEmail: string | null;
  customerId: string | null;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  titleSnapshot: string;
  priceCentsSnapshot: number;
}

export interface CartLine {
  productId: string;
  title: string;
  slug: string;
  priceCents: number;
}
