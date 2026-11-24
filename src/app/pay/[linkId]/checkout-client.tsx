"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import freighterApi from "@stellar/freighter-api";
import qrcode from "qrcode-generator";
import { API_BASE } from "@/lib/api";
import { useCheckoutMessages, useLocale } from "@/lib/i18n";
import { friendlyMessage, randomMuxedId } from "@/lib/checkout";
import { reportError } from "@/lib/report-error";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { PaymentLink } from "@/lib/types";

interface CheckoutClientProps {
  linkId: string;
  initialLinkData: PaymentLink | null;
}

import { use, useEffect, useRef, useState } from "react";
import freighterApi from "@stellar/freighter-api";
import qrcode from "qrcode-generator";
import { API_BASE } from "@/lib/api";
import { useCheckoutMessages, useLocale } from "@/lib/i18n";
import { friendlyMessage, randomMuxedId } from "@/lib/checkout";
import { reportError } from "@/lib/report-error";

interface ConfirmedPayment {
  tx_hash: string;
  muxed_id: string;
}

export default function CheckoutClient({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const t = useCheckoutMessages();
  const locale = useLocale();

  // Keep <html lang> in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const [loadingText, setLoadingText] = useState(t("loading"));
  const [loadingIsError, setLoadingIsError] = useState(false);
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [qrSvg, setQrSvg] = useState("");
  const [qrUri, setQrUri] = useState("#");
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedPayment | null>(null);

  const alreadyConfirmed = useRef(false);
  const sharedMuxedId = useRef<string | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState<boolean | null>(null);

  function setStatusMsg(msg: string, isError = false) {
    setStatus(msg);
    setStatusIsError(isError);
  }

  function showSuccess(payment: ConfirmedPayment) {
    if (alreadyConfirmed.current) return; // either path can win; only act on the first
    alreadyConfirmed.current = true;
    setConfirmed(payment);
  }

  // Asks only about this payer's own session, so a checkout page never
  // sees anyone else's payments. A 404 (session not yet visible) just means
  // keep waiting.
  async function pollForConfirmation(
    pollLinkId: string,
    muxedId: string,
    attempts: number,
    intervalMs: number,
  ): Promise<ConfirmedPayment | null> {
    for (let i = 0; i < attempts; i++) {
      if (alreadyConfirmed.current) return null;
      const res = await fetch(`${API_BASE}/links/${pollLinkId}/sessions/${muxedId}`);
      if (res.ok) {
        const body: { confirmed: boolean; payment: { tx_hash: string } | null } = await res.json();
        if (body.confirmed && body.payment) return { tx_hash: body.payment.tx_hash, muxed_id: muxedId };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  // The one server round trip reserves the payer-chosen muxed_id against
  // this link. A collision is astronomically unlikely with a real random
  // 64-bit value, but the correct response was always "pick a new one and
  // retry" — this is that retry, actually wired up client-side.
  async function reserveSessionWithRetry(maxAttempts = 3): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateId = randomMuxedId();
      const res = await fetch(`${API_BASE}/links/${linkId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muxed_id: candidateId }),
      });
      if (res.ok) return candidateId;
      const body = await res.json().catch(() => ({}));
      lastError = new Error(body.message || "session reservation failed");
      if (res.status !== 409) throw lastError; // only retry on a genuine collision
    }
    throw lastError;
  }

  // Renders the SEP-7 `web+stellar:pay` request as a scannable QR code and
  // makes the same URI directly tappable — on a phone that already has a
  // Stellar wallet installed, tapping opens it without needing a camera at
  // all. Falls back to hiding this option if it can't be built, since
  // Freighter still works on its own.
  async function setupQrPayment(muxedId: string) {
    try {
      const res = await fetch(`${API_BASE}/payments/pay-uri?linkId=${linkId}&muxed_id=${muxedId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "could not build a payment request");
      const qr = qrcode(0, "M");
      qr.addData(body.uri);
      qr.make();
      setQrSvg(qr.createSvgTag(5, 8));
      setQrUri(body.uri);
    } catch (err) {
      reportError("checkout: QR setup failed", err);
      setShowQr(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      setStatusMsg(t("stageConnect"));
      const access = await freighterApi.requestAccess();
      if (access.error) throw new Error(access.error);
      const payerAddress = access.address;

      setStatusMsg(t("stagePrep"));
      // Reserved once for the whole checkout (see init below) so the QR
      // code and this button race toward the same session — whichever the
      // payer actually completes is the one that lands.
      const muxedId = sharedMuxedId.current!;

      const prepRes = await fetch(`${API_BASE}/payments/prepare-tx?linkId=${linkId}&muxed_id=${muxedId}&payer=${payerAddress}`);
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.message || "could not prepare transaction");

      setStatusMsg(t("stageSign"));
      const signed = await freighterApi.signTransaction(prep.xdr, {
        networkPassphrase: prep.network_passphrase,
        address: payerAddress,
      });
      if (signed.error) throw new Error(signed.error);

      setStatusMsg(t("stageSend"));
      // Raw Horizon REST call rather than the SDK's Server class — kept
      // this way even after moving off the CDN import, since it's fewer
      // moving parts to be wrong about.
      const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `tx=${encodeURIComponent(signed.signedTxXdr)}`,
      });
      const submitResult = await submitRes.json();
      if (!submitRes.ok) {
        const codes = submitResult.extras?.result_codes;
        throw new Error(codes ? JSON.stringify(codes) : submitResult.title || "submission failed");
      }

      setStatusMsg(t("stageConfirm"));
      // Short, bounded wait — Horizon's submit call above only returns once
      // the transaction is already in a ledger, so this is just waiting on
      // our own reconciler to notice, typically a few seconds. The QR
      // path's own ambient watcher (started on page load) has no such
      // deadline, since there's no way to know when someone might finish
      // scanning.
      const result = await pollForConfirmation(linkId, muxedId, 40, 2000);

      if (result) {
        showSuccess(result);
      } else {
        setStatusMsg("Your payment was sent but hasn't been confirmed on Stellar yet. This can take a few minutes on a busy network. You don't need to pay again: the merchant will see it as soon as it confirms, and you can close this page.", true);
      }
    } catch (err) {
      console.error("[konfirm checkout]", err);
      setStatusMsg(friendlyMessage(err), true);
    } finally {
      setConnecting(false);
    }
  }

  // Detect Freighter availability upfront so we can give the payer a clear
  // message before they click, rather than a confusing post-click error.
  useEffect(() => {
    // isConnected() throws / returns an error object on browsers where the
    // extension is categorically absent (Safari, Firefox without the add-on,
    // etc.). Any failure path means Freighter is unavailable.
    freighterApi.isConnected().then((res) => {
      setFreighterAvailable(!res.error && res.isConnected !== false);
    }).catch(() => {
      setFreighterAvailable(false);
    });
  }, []);

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
      if (!res.ok) {
        // Distinguish dead-link reasons (not found / expired / inactive /
        // blocked) rather than collapsing every non-2xx into one generic
        // "not found" — the payer deserves to know this isn't a transient
        // glitch they should retry.
        const body: { message?: string } = await res.json().catch(() => ({}));
        reportError("checkout: link unavailable", body.message || `status ${res.status}`);
        setLoadingText(body.message ? friendlyMessage(new Error(body.message)) : t("notFound"));
        setLoadingIsError(true);
        return;
      }
      setLoading(false);
      const data: LinkData = await res.json();
      setLinkData(data);
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
    <div className="page-center">
      <title>{`${linkData?.merchant_name ?? "Konfirm"} · Konfirm`}</title>
      <div className="card">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>

        {!linkData && !confirmed && (
          <div
            className={`status${loadingIsError ? " error" : ""}`}
            role={loadingIsError ? "alert" : "status"}
            aria-live={loadingIsError ? "assertive" : "polite"}
          >
            {loadingText}
          </div>
        )}

        {linkData && !confirmed && (
          <div>
            <div className="merchant-label">{linkData.merchant_name}</div>
            <div className="desc-label">{linkData.description || "Payment"}</div>
            {feeUsdc > 0 ? (
              <>
                <div className="amount-display">{totalDisplay}</div>
                <div className="sub" style={{ marginTop: -8, marginBottom: 16 }}>
                  {amountDisplay} + {feeDisplay} fee
                </div>
              </>
            ) : (
              <div className="amount-display">{amountDisplay}</div>
            )}

            {showQr && (
              <>
                <div className="qr-section">
                  <div className="qr-label">{t("scanQr")}</div>
                  {feeUsdc > 0 && (
                    <div className="sub" style={{ marginBottom: 8 }}>
                      {t("feePaidByMerchant", { amount: amountDisplay })}
                    </div>
                  )}
                  <a
                    className="qr-box"
                    href={qrUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open this payment request in your Stellar wallet"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <div className="qr-hint">{t("qrHint")}</div>
                </div>
                <div className="divider">{t("orDivider")}</div>
              </>
            )}

            {freighterAvailable === false ? (
              <div className="status error">
                {t("freighterUnavailable")}
              </div>
            ) : (
              <>
                <button type="button" className="primary" disabled={connecting} onClick={handleConnect}>
                  {t("connectFreighter")}
                </button>
                <div className={`status${statusIsError ? " error" : ""}`}>{status}</div>
              </>
            )}
          </div>
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
