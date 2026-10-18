"use client";

import { use, useEffect, useRef, useState } from "react";
import type { Metadata } from "next";
import freighterApi from "@stellar/freighter-api";
import qrcode from "qrcode-generator";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { useBeforeUnload } from "@/lib/use-before-unload";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

interface LinkData {
  merchant_name: string;
  description: string | null;
  amount_usdc: string;
  fee_usdc: string | null;
  currency: string;
  stellar_base_address: string;
}

interface ConfirmedPayment {
  tx_hash: string;
  muxed_id: string;
}

const STAGE = {
  CONNECT: "Connecting your wallet…",
  PREP: "Preparing your payment…",
  SIGN: "Approve the payment in your wallet…",
  SEND: "Sending your payment…",
  CONFIRM: "Konfirming…",
};

// Every status line here is written for the person paying, not for whoever's
// debugging this later — no "session," "reconciler," or "screening" ever
// reaches this screen. Technical detail still goes to the console.
function friendlyMessage(err: unknown): string {
  const msg = String((err as Error)?.message || err || "");
  const knownSafe = [
    "link is not active",
    "link has expired",
    "link not found",
    "this address is not permitted to pay",
    "pay-what-you-want links need an amount",
  ];
  if (knownSafe.some((s) => msg.toLowerCase().includes(s))) {
    return "This payment link isn't available right now. Please contact the merchant.";
  }
  if (msg.toLowerCase().includes("declined") || msg.toLowerCase().includes("rejected")) {
    return "You'll need to approve the payment in your wallet to continue.";
  }
  if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked, then try again.";
  }
  return "Something didn't go through on our end. Please try again.";
}

function randomMuxedId(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // Keep it within the positive int64 range Soroban/Stellar expect.
  const high = BigInt(buf[0] & 0x7fffffff);
  const low = BigInt(buf[1]);
  return ((high << 32n) | low).toString();
}

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);

  const [loadingText, setLoadingText] = useState("Loading…");
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
  // True only while a payment is being signed/submitted/confirmed, so the
  // beforeunload prompt never fires during passive polling or idle states.
  const operationInFlight = useRef(false);
  useBeforeUnload(operationInFlight);

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
      if (alreadyConfirmed.current || cancelledRef.current) return null;
      const res = await fetch(`${API_BASE}/links/${pollLinkId}/sessions/${muxedId}`);
      if (cancelledRef.current) return null;
      if (res.ok) {
        const body: { confirmed: boolean; payment: { tx_hash: string } | null } = await res.json();
        if (cancelledRef.current) return null;
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
      if (cancelledRef.current) return;
      setQrSvg(qr.createSvgTag(5, 8));
      setQrUri(body.uri);
    } catch (err) {
      reportError(err, { tags: { flow: "checkout", stage: "qr-setup", linkId } });
      setShowQr(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    operationInFlight.current = true;
    try {
      setStatusMsg(STAGE.CONNECT);
      const access = await freighterApi.requestAccess();
      if (access.error) throw new Error(access.error);
      const payerAddress = access.address;

      setStatusMsg(STAGE.PREP);
      // Reserved once for the whole checkout (see init below) so the QR
      // code and this button race toward the same session — whichever the
      // payer actually completes is the one that lands.
      const muxedId = sharedMuxedId.current!;

      const prepRes = await fetch(`${API_BASE}/payments/prepare-tx?linkId=${linkId}&muxed_id=${muxedId}&payer=${payerAddress}`);
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.message || "could not prepare transaction");

      setStatusMsg(STAGE.SIGN);
      const signed = await freighterApi.signTransaction(prep.xdr, {
        networkPassphrase: prep.network_passphrase,
        address: payerAddress,
      });
      if (signed.error) throw new Error(signed.error);

      setStatusMsg(STAGE.SEND);
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

      setStatusMsg(STAGE.CONFIRM);
      // Short, bounded wait — Horizon's submit call above only returns once
      // the transaction is already in a ledger, so this is just waiting on
      // our own reconciler to notice, typically a few seconds. The QR
      // path's own ambient watcher (started on page load) has no such
      // deadline, since there's no way to know when someone might finish
      // scanning.
      const result = await pollForConfirmation(linkId, muxedId, 40, 2000);
      if (cancelledRef.current) return;

      if (result) {
        showSuccess(result);
      } else {
        setStatusMsg("Your payment was sent but hasn't been confirmed on Stellar yet. This can take a few minutes on a busy network. You don't need to pay again: the merchant will see it as soon as it confirms, and you can close this page.", true);
      }
    } catch (err) {
      reportError(err, { tags: { flow: "checkout", stage: "connect-and-pay", linkId } });
      setStatusMsg(friendlyMessage(err), true);
    } finally {
      operationInFlight.current = false;
      setConnecting(false);
    }
  }

  useEffect(() => {
    cancelledRef.current = false;

    // Scope confirmation state to this linkId: if this component instance is
    // ever reused for a different link without a full remount, the new link
    // must be able to confirm rather than silently no-op.
    alreadyConfirmed.current = false;
    sharedMuxedId.current = null;

    async function init() {
      const res = await fetch(`${API_BASE}/links/${linkId}/public`);
      if (cancelledRef.current) return;
      if (!res.ok) {
        setLoadingText("This payment link could not be found.");
        return;
      }
      const data: LinkData = await res.json();
      if (cancelledRef.current) return;
      setLinkData(data);
      try {
        sharedMuxedId.current = await reserveSessionWithRetry();
      } catch (err) {
        reportError(err, { tags: { flow: "checkout", stage: "reserve-session", linkId } });
        setStatusMsg(friendlyMessage(err), true);
        setShowQr(false);
        return;
      }
      if (cancelledRef.current) return;
      // QR and mobile wallets pay the link amount. A platform fee on this
      // link is owed by the merchant and settled from their dashboard
      // (docs/design/qr-fee-collection.md, Option B), so it isn't added here.
      await setupQrPayment(sharedMuxedId.current);
      if (cancelledRef.current) return;
      // Long, silent watch — up to 10 minutes — for the QR/mobile-wallet
      // path, which has no "just submitted" moment to bound the wait
      // against.
      pollForConfirmation(linkId, sharedMuxedId.current, 300, 2000).then((result) => {
        if (cancelledRef.current) return;
        if (result) showSuccess(result);
      });
    }

    init();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  function formatCurrency(value: string, currency: string): string {
    const str = Number(value).toFixed(2);
    return currency === "USDC" ? `$${str}` : `${str} ${currency}`;
  }

  const amountDisplay = linkData ? formatCurrency(linkData.amount_usdc, linkData.currency) : "";
  const feeUsdc = linkData?.fee_usdc ? Number(linkData.fee_usdc) : 0;
  const feeDisplay = linkData && feeUsdc > 0 ? formatCurrency(linkData.fee_usdc as string, linkData.currency) : "";
  const totalDisplay =
    linkData && feeUsdc > 0
      ? formatCurrency((Number(linkData.amount_usdc) + feeUsdc).toString(), linkData.currency)
      : "";

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>

        <h1 className="visually-hidden">
          {linkData ? `Pay ${linkData.merchant_name}` : "Checkout"}
        </h1>

        {!linkData && !confirmed && <div>{loadingText}</div>}

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
                  <div className="qr-label">Scan with your Stellar wallet</div>
                  {feeUsdc > 0 && (
                    <div className="sub" style={{ marginBottom: 8 }}>
                      Pay {amountDisplay} from your wallet. The platform fee is settled by the merchant.
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
                  <div className="qr-hint">Lobstr, Vibrant, Beans, xBull, and others</div>
                </div>
                <div className="divider">or</div>
              </>
            )}

            <button type="button" className="primary" disabled={connecting} onClick={handleConnect}>
              Connect Freighter &amp; Pay
            </button>
            <div className={`status${statusIsError ? " error" : ""}`}>{status}</div>
          </div>
        )}

        {confirmed && (
          <div className="success-box">
            <div className="tick">✓</div>
            <h1 className="success-title">Konfirmed</h1>
            <div className="success-detail">Your payment landed and was konfirmed on-chain.</div>
            <a
              className="txlink"
              href={`https://stellar.expert/explorer/testnet/tx/${confirmed.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on stellar.expert →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
