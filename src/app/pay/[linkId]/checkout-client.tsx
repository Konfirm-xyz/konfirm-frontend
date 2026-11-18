"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { PaymentLink } from "@/lib/types";

interface CheckoutClientProps {
  linkId: string;
  initialLinkData: PaymentLink | null;
}

export default function CheckoutClient({
  linkId,
  initialLinkData,
}: CheckoutClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [linkData, setLinkData] = useState<PaymentLink | null>(initialLinkData);
  const [loading, setLoading] = useState(!initialLinkData);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (initialLinkData) return;

    let cancelled = false;

    async function fetchLink() {
      const { data, error: fetchError } = await supabase
        .from("payment_links")
        .select("*")
        .eq("id", linkId)
        .single();

      if (cancelled) return;

      if (fetchError || !data) {
        setError("This payment link could not be found.");
      } else {
        setLinkData(data as PaymentLink);
      }
      setLoading(false);
    }

    fetchLink();

    return () => {
      cancelled = true;
    };
  }, [linkId, initialLinkData, supabase]);

  async function handlePay() {
    if (!linkData) return;
    setPaying(true);
    setError(null);

    const { error: payError } = await supabase.functions.invoke("process-payment", {
      body: { linkId: linkData.id },
    });

    if (payError) {
      setError("Payment failed. Please try again.");
      setPaying(false);
      return;
    }

    router.push(`/pay/${linkId}/success`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading payment link…</p>
      </div>
    );
  }

  if (error && !linkData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!linkData) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <title>{`${linkData.merchant_name} · Konfirm`}</title>
      <div className="w-full max-w-md rounded-lg border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">{linkData.merchant_name}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {formatCurrency(linkData.amount, linkData.currency)}
        </h1>
        {linkData.description && (
          <p className="mt-2 text-sm text-muted-foreground">
            {linkData.description}
          </p>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handlePay}
          disabled={paying}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {paying ? "Processing…" : "Pay now"}
        </button>
      </div>
    </div>
  );
}
