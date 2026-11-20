"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { useBeforeUnload } from "@/lib/use-before-unload";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
type View = "step1" | "progress" | "step2" | "success";

function friendlyMessage(err: unknown): string {
  const msg = String((err as Error)?.message || err || "");
  if (msg.toLowerCase().includes("trustline")) {
    return "That address can't receive USDC yet — it needs a USDC trustline added first.";
  }
  if (msg.toLowerCase().includes("not found")) {
    return "We couldn't find that account. Double-check the address and try again.";
  }
  if (msg.toLowerCase().includes("declined") || msg.toLowerCase().includes("rejected")) {
    return "You'll need to approve the signature in your wallet to continue.";
  }
  if (msg.toLowerCase().includes("freighter") || msg.toLowerCase().includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked.";
  }
  return "Something didn't go through. Please try again.";
}

export default function GetTestUsdcPage() {
  const [view, setView] = useState<View>("step1");
  const [progressStage, setProgressStage] = useState("Working on it…");
  const [status1, setStatus1] = useState("");
  const [status2, setStatus2] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("5");

  const freighterAddress = useRef<string | null>(null);
  const signingInFlight = useRef(false);
  const sendInFlight = useRef(false);
  const cancelled = useRef(false);

  const setSigningInFlight = useCallback((value: boolean) => {
    signingInFlight.current = value;
  }, []);

  useBeforeUnload(signingInFlight);

  // Stop any in-flight polling when the component unmounts so no further
  // requests or state updates happen after unmount (same pattern as
  // src/app/cashout/page.tsx).
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  function showProgress(stage: string) {
    if (cancelled.current) return;
    setView("progress");
    setProgressStage(stage);
  }

  async function handleConnect() {
    setConnecting(true);
    setStatus1("");
    try {
      showProgress("Connecting your wallet…");
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const access = await freighterApi.requestAccess();
      if (access.error) throw new Error(access.error);
      freighterAddress.current = access.address;

      showProgress("Requesting a login challenge…");
      const challengeRes = await fetch(`${API_BASE}/deposits/challenge?account=${encodeURIComponent(freighterAddress.current)}`);
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) throw new Error(challenge.message || "could not reach the test-funds partner");

      showProgress("Approve the sign-in in your wallet…");
      setSigningInFlight(true);
      const signedChallenge = await freighterApi.signTransaction(challenge.transaction, {
        networkPassphrase: challenge.network_passphrase,
        address: freighterAddress.current,
      });
      if (signedChallenge.error) throw new Error(signedChallenge.error);

      const tokenRes = await fetch(`${API_BASE}/deposits/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: signedChallenge.signedTxXdr }),
      });
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenBody.message || "the test-funds partner rejected that signature");
      setSigningInFlight(false);

      showProgress("Opening the deposit form…");
      const startRes = await fetch(`${API_BASE}/deposits/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "USDC", token: tokenBody.token, account: freighterAddress.current }),
      });
      const startBody = await startRes.json();
      if (!startRes.ok) throw new Error(startBody.message || "could not start a deposit");

      window.open(startBody.url, "konfirm-deposit", "width=460,height=700,noopener,noreferrer");

      for (let i = 0; i < 150; i++) {
        if (cancelled.current) return;
        const statusRes = await fetch(
          `${API_BASE}/deposits/status?token=${encodeURIComponent(tokenBody.token)}&id=${encodeURIComponent(startBody.id)}`,
          { cache: "no-store" },
        );
        const txn = await statusRes.json();
        if (cancelled.current) return;
        if (txn.status === "completed") {
          setView("step2");
          return;
        }
        if (["error", "expired", "refunded"].includes(txn.status)) {
          throw new Error("the test-funds partner could not complete this one");
        }
        showProgress("Waiting for the deposit to land…");
        await new Promise((r) => setTimeout(r, 3000));
      }
      throw new Error("timed out waiting for the deposit");
    } catch (err) {
      reportError(err, { flow: "get-test-usdc", stage: "connect" });
      setView("step1");
      setStatus1(friendlyMessage(err));
    } finally {
      setSigningInFlight(false);
      setConnecting(false);
    }
  }

  async function handleSend() {
    if (sendInFlight.current) return;
    sendInFlight.current = true;

    const destTrimmed = dest.trim();
    if (!/^G[A-Z2-7]{55}$/.test(destTrimmed)) {
      setStatus2("Enter a valid Stellar G... address.");
      sendInFlight.current = false;
      return;
    }
    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setStatus2("Enter an amount greater than 0.");
      sendInFlight.current = false;
      return;
    }

    setSending(true);
    setStatus2("");
    try {
      showProgress("Preparing the transfer…");
      const prepRes = await fetch(`${API_BASE}/deposits/transfer-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: freighterAddress.current, to: destTrimmed, currency: "USDC", amount }),
      });
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.message || "could not prepare the transfer");

      showProgress("Approve the transfer in your wallet…");
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const signed = await freighterApi.signTransaction(prep.xdr, {
        networkPassphrase: prep.network_passphrase,
        address: freighterAddress.current!,
      });
      if (signed.error) throw new Error(signed.error);

      showProgress("Sending…");
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
      setSigningInFlight(false);

      if (cancelled.current) return;
      setView("success");
    } catch (err) {
      reportError(err, { flow: "get-test-usdc", stage: "send" });
      setView("step2");
      setStatus2(friendlyMessage(err));
    } finally {
      setSigningInFlight(false);
      setSending(false);
      sendInFlight.current = false;
    }
  }

  function handleAnother() {
    setView("step2");
    setStatus2("");
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1>Get test USDC</h1>
   

/* … truncated 2858 chars — edit only what you need near the top … */
