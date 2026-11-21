"use client";

import { use, useEffect, useRef, useState } from "react";
import freighterApi from "@stellar/freighter-api";
import qrcode from "qrcode-generator";
import { API_BASE } from "@/lib/api";
import { useCheckoutMessages, useLocale } from "@/lib/i18n";
import { friendlyMessage, randomMuxedId } from "@/lib/checkout";

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


export default function CheckoutClient({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = use(params);
  const t = useCheckoutMessages();
  const locale = useLocale();

  // Keep <html lang> in sync with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
      console.error("[konfirm checkout] QR setup failed", err);
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
      s

/* … truncated 5435 chars — edit only what you need near the top … */
