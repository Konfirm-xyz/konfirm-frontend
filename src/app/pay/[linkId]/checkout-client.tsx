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
    // Persisted so a page refresh resumes polling the same session instead
    // of reserving a new, unrelated one — losing track of a payment that
    // may already be in flight (scanned, signed, or even submitted) against
    // the old muxed_id.
    const storageKey = `konfirm:muxed_id:${linkId}`;

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
      const data: LinkData = await res.json();
      setLinkData(data);
      try {
        const existing = sessionStorage.getItem(storageKey);
        if (existing) {
          sharedMuxedId.current = existing;
        } else {
          sharedMuxedId.current = await reserveSessionWithRetry();
          sessionStorage.setItem(storageKey, sharedMuxedId.current);
        }
      } catch (err) {
        console.error("[konfirm checkout] could not reserve a payment session", err);
        setStatusMsg(friendlyMessage(err), true);
        setShowQr(false);
        return;
      }
      // QR and mobile wallets pay the link amount. A platform fee on this
      // link is owed by the merchant and settled from their dashboard
      // (docs/design/qr-fee-collection.md, Option B), so it isn't added here.
      await setupQrPayment(sharedMuxedId.current);
      // Long, silent watch — up to 10 minutes — for the QR/mobile-wallet
      // path, which has no "just submitted" moment to bound the wait
      // against.
      pollForConfirmation(linkId, sharedMuxedId.current, 300, 2000).then((result) => {
        if (result) showSuccess(result);
      });
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
