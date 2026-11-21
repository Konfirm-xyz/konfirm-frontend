"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { useRequireAuth } from "@/lib/useAuth";
import { CURRENCY_DECIMALS, CURRENCY_SYMBOLS, parseAmount, type Currency } from "@/lib/amount";

const RECENT_LINK_KEY = "konfirm:recentLink";
const DRAFT_KEY = "konfirm:newPaymentDraft";

const COPY_FEEDBACK_MS = 4000;
const DRAFT_SAVE_DEBOUNCE_MS = 300;

interface Merchant {
  name: string;
}

interface PaymentDraft {
  amount: string;
  currency: Currency;
  description: string;
}

function readDraft(): PaymentDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaymentDraft>;
    const currency: Currency =
      parsed.currency === "USDC" || parsed.currency === "EURC" || parsed.currency === "XLM"
        ? parsed.currency
        : "XLM";
    return {
      amount: typeof parsed.amount === "string" ? parsed.amount : "",
      currency,
      description: typeof parsed.description === "string" ? parsed.description : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: PaymentDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage unavailable — ignore
  }
}

export default function NewPaymentPage() {
  const router = useRouter();
  const { data: merchant, resolved } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  const [showResult, setShowResult] = useState(false);
  const inFlight = useRef(false);
  const draftRestored = useRef(false);

  // Restore any saved draft on mount so navigating away and back keeps the values.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<PaymentDraft>;
        if (typeof draft.amount === "string") setAmount(draft.amount);
        if (typeof draft.description === "string") setDescription(draft.description);
        if (draft.currency === "XLM" || draft.currency === "USDC" || draft.currency === "EURC") {
          setCurrency(draft.currency);
        }
      }
    } catch {
      // sessionStorage unavailable or malformed draft — ignore
    } finally {
      draftRestored.current = true;
    }
  }, []);

  // Persist the draft (debounced) as the user types, once the initial restore has run.
  useEffect(() => {
    if (!draftRestored.current) return;
    const timer = setTimeout(() => {
      try {
        if (!amount && !description) {
          sessionStorage.removeItem(DRAFT_KEY);
          return;
        }
        const draft: PaymentDraft = { amount, currency, description };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // sessionStorage unavailable — ignore
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [amount, currency, description]);

  // Restore any in-progress draft saved before a session-expiry redirect.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setAmount(draft.amount);
    setCurrency(draft.currency);
    setDescription(draft.description);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amountRaw = amount.trim();
    setStatus("");
    setAmountInvalid(false);

    if (!amountRaw) {
      setStatus("Enter an amount greater than 0.");
      setAmountInvalid(true);
      return;
    }

    const amountNum = parseAmount(amountRaw);
    if (amountNum === null) {
      setStatus("Enter a valid amount, like 1234.56.");
      setAmountInvalid(true);
      return;
    }
    if (amountNum <= 0) {
      setStatus("Enter an amount greater than 0.");
      setAmountInvalid(true);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await apiPost<{ id: string }>("/links", {
        amount_usdc: amountNum.toFixed(CURRENCY_DECIMALS[currency]),
        currency,
        description: description.trim() || undefined,
      });
      if (!result.ok) {
        if (result.status === 401) {
          // Preserve the in-progress form so nothing is lost across re-login.
          writeDraft({ amount, currency, description });
          setStatus("Your session has expired — please log in again. Your draft has been saved.");
          router.push("/login?returnTo=%2Fnew");
          return;
        }
        const bodyMessage = (result.body as { message?: unknown } | null)?.message;
        throw new Error(typeof bodyMessage === "string" ? bodyMessage : "Could not create that payment link.");
      }

      if (!result.data) {
        throw new Error("Could not create that payment link.");
      }
      const url = `${window.location.origin}/pay/${result.data.id}`;
      setLinkUrl(url);
      setShowResult(true);
      try {
        window.localStorage.setItem(RECENT_LINK_KEY, url);
      } catch {
        // localStorage may be unavailable (private mode, quota); the link is still shown.
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // sessionStorage unavailable — ignore
      }
    } catch (err) {
      reportError(err, { tags: { area: "new-payment", action: "create-link" } });
      setStatus(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(linkUrl);
        setStatus("");
        setCopyLabel("Copied");
        setCopyAnnouncement("Link copied to clipboard.");
        setTimeout(() => {
          setCopyLabel("Copy");
          setCopyAnnouncement("");
        }, COPY_FEEDBACK_MS);
        return;
      } catch (err) {
        console.error("[konfirm new-payment] clipboard", err);
      }
    }

    // Fallback for browsers/contexts without the async Clipboard API.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = linkUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (!ok) throw new Error("execCommand copy failed");
      setStatus("");
      setCopyLabel("Copied");
      setCopyAnnouncement("Link copied to clipboard.");
      setTimeout(() => {
        setCopyLabel("Copy");
        setCopyAnnouncement("");
      }, COPY_FEEDBACK_MS);
    } catch (err) {
      console.error("[konfirm new-payment] clipboard fallback", err);
      setStatus("Couldn't copy — select and copy the link manually.");
    }
  }

  function handleAnother() {
    setAmount("");
    setDescription("");
    setShowResult(false);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // sessionStorage unavailable — ignore
    }
  }

  if (!resolved) return null;

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
          <form onSubmit={handleSubmit}>
            <h1>Request a payment</h1>
            <p className="sub">
              {merchant?.name ? `Create a link you can send anyone — from ${merchant.name}.` : "Create a link you can send anyone."}
            </p>

            <div className="amount-row">
              <span className={`dollar${currency === "XLM" ? " hidden" : ""}`}>{CURRENCY_SYMBOLS[currency]}</span>
              <label htmlFor="amount-input" className="visually-hidden">
                Payment amount
              </label>
              <input
                id="amount-input"
                className="amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amountInvalid}
                aria-describedby={amountInvalid ? "form-status" : undefined}
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
            </div>

            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create payment link"}
            </button>
            {status && (
              <p id="form-status" className="status" role="alert">
                {status}
              </p>
            )}
          </form>
        ) : (
          <div>
            <h1>Link ready</h1>
            <p className="sub">Share this link to get paid.</p>
            <div className="link-box">
              <input type="text" readOnly value={linkUrl} onFocus={(e) => e.target.select()} />
              <button className="btn" type="button" onClick={handleCopy}>
                {copyLabel}
              </button>
            </div>
            <p className="visually-hidden" role="status" aria-live="polite">
              {copyAnnouncement}
            </p>
            {status && (
              <p className="status" role="alert">
                {status}
              </p>
            )}
            <button className="btn secondary" type="button" onClick={handleAnother}>
              Create another
            </button>
            <button className="btn secondary" type="button" onClick={handleAnother}>
              Create another
            </button>
            <Link className="secondary" href="/links">
              View my payments
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
