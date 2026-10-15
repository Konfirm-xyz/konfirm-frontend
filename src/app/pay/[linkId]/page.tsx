import type { Metadata } from "next";
import CheckoutClient from "./checkout-client";

// The backend URL the BFF proxy forwards to (see next.config.ts). Server-side
// components can't use the browser-only `/api/backend` rewrite, so we fetch
// the public link payload directly from the backend here.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4001";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://konfirm.app";

interface PublicLink {
  merchant_name: string;
  description: string | null;
  amount_usdc: string;
  currency: string;
}

function formatCurrency(value: string, currency: string): string {
  const str = Number(value).toFixed(2);
  return currency === "USDC" ? `$${str}` : `${str} ${currency}`;
}

// Link-preview bots (Slack, WhatsApp, iMessage, X, Discord) don't execute
// client-side JS, so the checkout page's dynamic merchant context has to be
// emitted as real server-rendered Open Graph / Twitter Card tags. Without
// this, every shared /pay/[linkId] unfurls as the generic root description —
// identical for a $5 invoice and a $50,000 invoice, identical across every
// merchant — which is a real trust/anti-phishing gap for a payments product.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ linkId: string }>;
}): Promise<Metadata> {
  const { linkId } = await params;

  let title = "Pay with Konfirm";
  let description = "A non-custodial payment processor on Stellar.";
  let amount: string | null = null;
  let merchant: string | null = null;

  try {
    const res = await fetch(`${BACKEND_URL}/links/${linkId}/public`, {
      // The link payload can change (amount, expiry, merchant) — never cache
      // a stale preview for a payment link.
      cache: "no-store",
    });
    if (res.ok) {
      const data: PublicLink = await res.json();
      merchant = data.merchant_name || null;
      amount = data.amount_usdc ? formatCurrency(data.amount_usdc, data.currency) : null;
      if (merchant) {
        title = amount ? `Pay ${merchant} ${amount}` : `Pay ${merchant}`;
      }
      description = data.description || `Pay ${merchant ?? "this merchant"} with Konfirm.`;
    }
  } catch {
    // Backend unreachable — fall back to the generic tags rather than
    // breaking the checkout page itself.
  }

  const url = `${SITE_URL}/pay/${linkId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Konfirm",
      type: "website",
      images: [
        {
          url: "/og-pay.png",
          width: 1200,
          height: 630,
          alt: merchant ? `Pay ${merchant} with Konfirm` : "Pay with Konfirm",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-pay.png"],
    },
  };
}

export default async function PayPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  return <CheckoutClient linkId={linkId} />;
}
