"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { reportError } from "@/lib/report-error";
import { useBeforeUnload } from "@/lib/use-before-unload";

type Currency = "XLM" | "USDC";
type View = "form" | "progress" | "success";

interface Merchant {
  stellar_base_address: string | null;
}

const STATUS_COPY: Record<string, [string, string]> = {
  incomplete: ["Waiting for you to finish the form…", "Complete the details in the popup window."],
  pending_user_transfer_start: ["Confirm the transfer in your wallet…", ""],
  pending_anchor: ["Your cash-out is processing…", "The partner is handling the transfer."],
  pending_external: ["Your cash-out is processing…", "The partner is handling the transfer."],
  pending_stellar: ["Sending your cash-out…", ""],
  pending_user: ["Action needed…", "Check the popup window for a next step."],
  on_hold: ["Your cash-out is on hold…", "The partner may need more information."],
};

// Curated, user-actionable validation codes whose backend `message` is safe
// to surface verbatim. Anything else falls back to a generic message so we
// never leak raw backend text (see #41) while still showing specific,
// self-correctable errors like amount-out-of-range (see #95).
const SAFE_ERROR_CODES = new Set([
  "amount_below_minimum",
  "amount_above_maximum",
  "amount_out_of_range",
  "invalid_amount",
  "amount_limit_exceeded",
]);

function friendlyMessage(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  const msg = String((err as Error)?.message || err || "");
  const lower = msg.toLowerCase();
  if (lower.includes("freighter") || lower.includes("wallet")) {
    return "We couldn't connect to your wallet. Make sure Freighter is installed and unlocked, then try again.";
  }
  if (lower.includes("declined") || lower.includes("rejected")) {
    return "You'll need to approve the signature in your wallet to continue.";
  }
  if (typeof code === "string" && SAFE_ERROR_CODES.has(code) && msg) {
    return msg;
  }
  return "Something didn't go through with the cash-out partner. Please try again.";
}

export default function CashoutPage() {
  const { data: merchant, resolved } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [view, setView] = useState<View>("form");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [hint, setHint] = useState("");
  const [starting, setStarting] = useState(false);
  const [freighterAvailable, setFreighterAvailable] = useState<boolean | null>(null);

  const merchantAddress = useRef<string | null>(null);
  const cancelled = useRef(false);
  const paymentSubmitted = useRef(false);
  const signingInFlight = useRef(false);
  const inFlight = useRef(false);
  useBeforeUnload(signingInFlight);

  useEffect(() => {
    import("@stellar/freighter-api").then(({ default: freighterApi }) => freighterApi.isConnected()).then((res) => {
      setFreighterAvailable(!res.error && res.isConnected !== false);
    }).catch(() => {
      setFreighterAvailable(false);
    });
  }, []);

  // Ref mutation (not React state) in response to an external value
  // arriving — the one part of the original effect that's genuinely
  // syncing with an outside system, not deriving UI. The "no address on
  // file" message below is computed at render time instead of via
  // setState in this effect, which would otherwise trigger an avoidable
  // cascading render.
  useEffect(() => {
    if (merchant?.stellar_base_address) {
      merchantAddress.current = merchant.stellar_base_address;
    }
  }, [merchant]);

  // Stop any in-flight polling when the component unmounts (e.g. the user
  // navigates away mid cash-out) so no further requests or state updates
  // happen after unmount.
  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);
  const missingAddressStatus =
    merchant && !merchant.stellar_base_address ? "Add a Stellar address to your account before cashing out." : "";

  function showProgress(s: string, h = "") {
    setView("progress");
    setStage(s);
    setHint(h);
  }

  function showFormError(msg: string) {
    inFlight.current = false;
    setView("form");
    setStatus(msg);
    setStarting(false);
  }

  async function sendWithdrawalPayment(token: string, id: string) {
    if (cancelled.current) return;
    showProgress("Preparing the transfer…");
    const prepRes = await fetch(`${API_BASE}/withdrawals/prepare-payment`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, token, id }),
    });
    if (cancelled.current) return;
    const prep = await prepRes.json();
    if (cancelled.current) return;
    if (!prepRes.ok) throw Object.assign(new Error(prep.message || "could not prepare the transfer"), { code: prep.code });

    if (!merchantAddress.current) throw new Error("no Stellar address on file");
    showProgress("Approve the transfer in your wallet…");
    const { default: freighterApi } = await import("@stellar/freighter-api");
    const signed = await freighterApi.signTransaction(prep.xdr, {
      networkPassphrase: prep.network_passphrase,
      address: merchantAddress.current,
    });
    if (cancelled.current) return;
    if (signed.error) throw new Error(signed.error);

    showProgress("Sending your cash-out…");
    const submitRes = await fetch(`${API_BASE}/withdrawals/submit-tx`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xdr: signed.signedTxXdr }),
    });
    if (cancelled.current) return;
    const submitResult = await submitRes.json();
    if (cancelled.current) return;
    if (!submitRes.ok) {
      const codes = submitResult.extras?.result_codes;
      throw new Error(codes ? JSON.stringify(codes) : submitResult.title || submitResult.message || "submission failed");
    }
  }

  async function pollStatus(token: string, id: string) {
    while (!cancelled.current) {
      const res = await fetch(`${API_BASE}/withdrawals/status?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`);
      if (cancelled.current) return;
      const txn = await res.json().catch(() => ({}));
      if (cancelled.current) return;
      if (!res.ok) {
        showFormError(friendlyMessage(Object.assign(new Error(txn.message), { code: txn.code })));
        return;
      }

      if (txn.status === "completed") {
        setView("success");
        return;
      }
      if (["error", "expired", "refunded"].includes(txn.status)) {
        showFormError("The cash-out partner could not complete this one. Please try again.");
        return;
      }

      if (txn.status === "pending_user_transfer_start" && !paymentSubmitted.current) {
        paymentSubmitted.current = true;
        try {
          await sendWithdrawalPayment(token, id);
          if (cancelled.current) return;
        } catch (err) {
          if (cancelled.current) return;
          reportError(err, { tags: { flow: "cashout", stage: "withdrawal_payment" } });
          showFormError(friendlyMessage(err));
          return;
        }
      }

      if (cancelled.current) return;
      const copy = STATUS_COPY[txn.status] ?? ["Working on it…", ""];
      showProgress(copy[0], copy[1]);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async function handleStart() {
    if (inFlight.current || missingAddressStatus) return;
    inFlight.current = true;
    setStarting(true);
    paymentSubmitted.current = false;
    cancelled.current = false;
    try {
      setStatus("Connecting your wallet…");
      const { default: freighterApi } = await import("@stellar/freighter-api");
      const access = await freighterApi.requestAccess();
      if (cancelled.current) return;
      if (access.error) throw new Error(access.error);

      showProgress("Requesting a secure sign-in…");
      const challengeRes = await fetch(`${API_BASE}/withdrawals/challenge`, { credentials: "include" });
      if (cancelled.current) return;
      const challenge = await challengeRes.json();
      if (cancelled.current) return;
      if (!challengeRes.ok) throw Object.assign(new Error(challenge.message || "could not reach the cash-out partner"), { code: challenge.code });

      if (!merchantAddress.current) throw new Error("no Stellar address on file");
      showProgress("Approve the sign-in in your wallet…");
      signingInFlight.current = true;
      const signed = await freighterApi.signTransaction(challenge.xdr, {
        networkPassphrase: challenge.network_passphrase,
        address: merchantAddress.current,
      });
      signingInFlight.current = false;
      if (cancelled.current) return;
      if (signed.error) throw new Error(signed.error);

      showProgress("Starting your cash-out…");
      const startRes = await fetch(`${API_BASE}/withdrawals/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, signed_challenge: signed.signedTxXdr }),
      });
      if (cancelled.current) return;
      const start = await startRes.json();
      if (cancelled.current) return;
      if (!startRes.ok) throw Object.assign(new Error(start.message || "could not start the cash-out"), { code: start.code });

      await pollStatus(start.token, start.id);
    } catch (err) {
      if (cancelled.current) return;
      signingInFlight.current = false;
      reportError(err, { tags: { flow: "cashout", stage: "start" } });
      showFormError(friendlyMessage(err));
    } finally {
      signingInFlight.current = false;
      if (!cancelled.current) setStarting(false);
    }
  }

  if (!resolved) return null;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Cash out</h1>
      <p className="mt-2 text-sm text-slate-600">
        Convert your balance to {currency} and send it to your wallet.
      </p>

      {view === "form" && (
        <div className="mt-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="currency">Currency</label>
            <select
              id="currency"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              disabled={starting}
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">
              EURC cash-out isn&apos;t supported yet — our testnet cash-out partner only settles XLM and USDC.
              If you&apos;ve accepted EURC payments, hold them for now; EURC cash-out will be added once the
              partner supports it. See the{" "}
              <Link href="/docs" className="underline">
                docs
              </Link>{" "}
              for details.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Amount</label>
            <p className="mt-2 text-xs text-slate-500">
              Cash-outs are limited to 1–10 units per request on testnet.
            </p>
          </div>

          {(status || missingAddressStatus) && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {status || missingAddressStatus}
            </p>
          )}

          {freighterAvailable === false && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Freighter isn't available in this browser. Install it to continue.
            </p>
          )}

          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !merchant?.stellar_base_address || freighterAvailable === false}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start cash-out"}
          </button>
        </div>
      )}

      {view === "progress" && (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium text-slate-900">{stage}</p>
          {hint && <p className="text-sm text-slate-600">{hint}</p>}
        </div>
      )}

      {view === "success" && (
        <div className="mt-8 space-y-4">
          <p className="text-sm font-medium text-green-700">Cash-out complete.</p>
          <button
            type="button"
            onClick={() => {
              setView("form");
              setStatus("");
              setStarting(false);
              inFlight.current = false;
            }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Start another
          </button>
          <Link className="text-sm underline" href="/activity">
            View your activity
          </Link>
        </div>
        {view === "form" && (
          <div>
            <h1>Cash out</h1>
            <p className="sub">Move funds from your Stellar wallet to a bank account through a Stellar anchor partner.</p>

            <div className="currency-toggle">
              {(["XLM", "USDC"] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ctoggle${currency === c ? " active" : ""}`}
                  aria-pressed={currency === c}
                  onClick={() => setCurrency(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="limit-note">This test partner accepts between 1–10 units per cash-out.</div>

            {freighterAvailable === false ? (
              <div className="status error">
                Cash-out requires the Freighter browser extension. Open this page in Chrome or Firefox on desktop with{" "}
                <a href="https://freighter.app" target="_blank" rel="noopener noreferrer">Freighter installed</a>.
              </div>
            ) : (
              <>
                <button type="button" className="primary" disabled={starting || Boolean(missingAddressStatus)} onClick={handleStart}>
                  {starting ? "Starting…" : "Connect wallet & start cash-out"}
                </button>
                <div className={`status${status || missingAddressStatus ? " error" : ""}`}>{status || missingAddressStatus}</div>
              </>
            )}
          </div>
        )}

        {view === "progress" && (
          <div className="progress">
            <div className="spin" />
            <div className="stage">{stage}</div>
            <div className="hint">{hint}</div>
          </div>
        )}

        {view === "success" && (
          <div className="success-box">
            <div className="tick">✓</div>
            <h1 className="success-title">Cash-out complete</h1>
            <div className="success-detail">Your funds are on their way to your bank.</div>
            <button type="button" className="secondary" onClick={handleAnother}>
              Start another cash-out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
