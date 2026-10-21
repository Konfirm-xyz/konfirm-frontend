import type { Metadata } from "next";
import { API_BASE } from "@/lib/api";
import CheckoutClient from "./checkout-client";

interface LinkPublic {
  merchant_name: string;
  description: string | null;
  amount_usdc: string;
  currency: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ linkId: string }>;
}): Promise<Metadata> {
  const { linkId } = await params;

  try {
    const res = await fetch(`${API_BASE}/api/links/${linkId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        title: "Pay via Konfirm",
        description: "A non-custodial payment on Stellar.",
      };
    }
    const data = (await res.json()) as LinkPublic;
    const amountStr =
      data.currency === "USDC"
        ? `$${Number(data.amount_usdc).toFixed(2)}`
        : `${Number(data.amount_usdc).toFixed(2)} ${data.currency}`;
    const title = `Pay ${amountStr} to ${data.merchant_name} · Konfirm`;
    const description = data.description
      ? `${data.description} — Pay ${amountStr} via Stellar.`
      : `Pay ${amountStr} to ${data.merchant_name} on Stellar via Konfirm.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return {
      title: "Pay via Konfirm",
      description: "A non-custodial payment on Stellar.",
      openGraph: {
        title: "Pay via Konfirm",
        description: "A non-custodial payment on Stellar.",
      },
    };
  }
}

export default function CheckoutPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  return <CheckoutClient params={params} />;
}
