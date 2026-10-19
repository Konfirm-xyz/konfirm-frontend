"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useRequireAuth } from "@/lib/useAuth";

const RECENT_LINK_KEY = "konfirm:recentLink";

type Currency = "XLM" | "USDC" | "EURC";

const CURRENCY_SYMBOLS: Record<Currency, string> = { XLM: "", USDC: "$", EURC: "€" };

interface Merchant {
  name: string;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const { data: merchant } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [showResult, setShowResult] = useState(false);

  async function handleSubmit() {
    const amountRaw = amount.trim();
    setStatus("");

    const amountNum = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amountNum) || amountNum <= 0) {
      setStatus("Enter an amount greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiPost<{ id: string }>("/links", {
        amount_usdc: amountNum.toFixed(2),
        currency,
        description: description.trim() || undefined,
      });
      if (!result.ok) {
        if (result.status === 401) {
          router.push("/login");
          return;
        }
        const bodyMessage = (result.body as { message?: unknown } | null)?.message;
        throw new Error(typeof bodyMessage === "string" ? bodyMessage : "Could not create that payment link.");
      }

      const url = `${window.location.origin}/pay/${result.data.id}`;
      setLinkUrl(url);
      setShowResult(true);
      try {
        window.localStorage.setItem(RECENT_LINK_KEY, url);
      } catch {
        // localStorage may be unavailable (private mode, quota); the link is still shown.
      }
    } catch (err) {
      reportError(err, { tags: { area: "new-payment", action: "create-link" } });
      setStatus(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setStatus("");
      setCopyLabel("Copied");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch (err) {
      console.error("[konfirm new-payment] clipboard", err);
      setStatus("Couldn't copy — select and copy the link manually.");
    }
  }

  function handleAnother() {
    setAmount("");
    setDescription("");
    setShowResult(false);
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="top">
          <div className="brand">
            <span className="mark">✓</span> Konfirm
          </div>
          <Link className="back" href="/activity">
            ← Activity
          </Link>
          <Link className="back" href="/links">
            My links
          </Link>
        </div>

        {!showResult ? (
          <div>
            <h1>Request a payment</h1>
            <p className="sub">
              {merchant?.name ? `Create a link you can send anyone — from ${merchant.name}.` : "Create a link you can send anyone."}
            </p>

            <div className="amount-row">
              <span className={`dollar${currency === "XLM" ? " hidden" : ""}`}>{CURRENCY_SYMBOLS[currency]}</span>
              <input
                className="amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="currency-toggle">
              {(["XLM", "USDC", "EURC"] as Currency[]).map((c) => (
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

            <div className="field">
              <label htmlFor="desc">What&apos;s it for?</label>
              <input
                id="desc"
                type="text"
                placeholder="e.g. A gift for Mom"
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="chips">
                {["Gift", "Payment", "Service"].map((fill) => (
                  <div key={fill} className="chip" onClick={() => setDescription(fill)}>
                    {fill}
                  </div>
                ))}
              </div>
            </div>

            <button type="button" className="primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Creating…" : "Create payment link"}
            </button>
            <div className={`status${status ? " error" : ""}`}>{status}</div>
          </div>
        ) : (
          <div className="success-box">
            <div className="tick">✓</div>
            <h1 className="success-title">Ready to send</h1>
            <div className="success-detail">Share this link, or open it yourself to test it now.</div>
            <div className="link-box">
              <span>{linkUrl}</span>
              <button type="button" onClick={handleCopy}>
                {copyLabel}
              </button>
            </div>
            <div className={`status${status ? " error" : ""}`}>{status}</div>
            <button type="button" className="primary" onClick={() => window.location.assign(linkUrl)}>
              Open checkout
            </button>
            <button type="button" className="secondary" onClick={handleAnother}>
              Request another payment
            </button>
            <Link className="secondary" href="/links">
              View my payment links
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
