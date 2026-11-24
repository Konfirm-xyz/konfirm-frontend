"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { formatUtcTimestamp } from "@/lib/format";

type RiskTier = "unverified" | "standard" | "established" | "enterprise";

interface Merchant {
  id: string;
  email: string;
  name: string;
  status: "pending" | "active" | "suspended";
  risk_tier: RiskTier;
  stellar_base_address: string | null;
  created_at: string;
}

const RISK_TIERS: RiskTier[] = ["unverified", "standard", "established", "enterprise"];
const REASON_MAX_LENGTH = 500;
const REASON_MIN_LENGTH = 3;

function formatDate(iso: string): string {
  return formatUtcTimestamp(iso);
}

function shortAddress(address: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Shared reason-capture policy for every consequential admin action on this
// page: a reason is always required, trimmed, at least REASON_MIN_LENGTH
// characters, and no longer than REASON_MAX_LENGTH. Returns the trimmed
// reason, or null if the admin cancelled or the input was invalid (in which
// case `error` is set).
function promptForReason(actionLabel: string, setError: (msg: string) => void): string | null {
  const reason = window.prompt(
    `Why? Required, shown in the activity log (max ${REASON_MAX_LENGTH} chars):`,
    "",
  );
  if (reason === null) return null;
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH) {
    setError(`A reason of at least ${REASON_MIN_LENGTH} characters is needed to ${actionLabel}.`);
    return null;
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    setError(`Reason must be ${REASON_MAX_LENGTH} characters or fewer (was ${trimmed.length}).`);
    return null;
  }
  return trimmed;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  const PAGE_SIZE = 50;

  function markPending(id: string, pending: boolean) {
    if (pending) {
      inFlight.current.add(id);
    } else {
      inFlight.current.delete(id);
    }
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function load(offset = 0) {
    const result = await apiFetch<Merchant[]>(`/admin/merchants?limit=${PAGE_SIZE}&offset=${offset}`);
    if (result.ok && result.data) {
      setMerchants((prev) => (offset === 0 ? result.data! : [...prev, ...result.data!]));
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    await load(merchants.length);
  }

  async function sendPasswordReset(merchant: Merchant) {
    if (inFlight.current.has(merchant.id)) return;
    if (!window.confirm(`Email a password-reset link to ${merchant.email}?`)) return;
    const reason = promptForReason("send a reset", setError);
    if (reason === null) return;
    markPending(merchant.id, true);
    setError("");
    const result = await apiPost(`/admin/merchants/${merchant.id}/password-reset`, { reason });
    if (result.ok) {
      window.alert(`Reset link sent to ${merchant.email}.`);
    } else {
      reportError("admin.merchant.password_reset", { merchantId: merchant.id, message: result.message });
      setError(result.message || "Could not send the reset email.");
    }
    markPending(merchant.id, false);
  }

  async function toggleStatus(merchant: Merchant) {
    if (inFlight.current.has(merchant.id)) return;
    const nextStatus = merchant.status === "suspended" ? "active" : "suspended";
    const verb = nextStatus === "suspended" ? "suspend" : "reactivate";
    const confirmMessage =
      nextStatus === "suspended"
        ? `Suspend ${merchant.name} (${merchant.email})?\n\nWhile suspended, this merchant cannot sign in to the dashboard or receive new payments; their existing links stop accepting payments until they're reactivated.`
        : `Reactivate ${merchant.name} (${merchant.email})?\n\nThis restores their ability to sign in and accept payments.`;
    if (!window.confirm(confirmMessage)) return;

    let reason: string | null = "";
    if (verb === "suspend") {
      reason = promptForReason("suspend this merchant", setError);
      if (reason === null) return;
    }

    markPending(merchant.id, true);
    setError("");
    const result = await apiPatch(`/admin/merchants/${merchant.id}/status`, {
      status: nextStatus,
      reason: reason || undefined,
    });
    if (result.ok) {
      await load();
    } else {
      reportError("admin.merchant.status_change", { merchantId: merchant.id, status: nextStatus, message: result.message });
      setError(result.message || `Could not ${verb} this merchant.`);
    }
    markPending(merchant.id, false);
  }

  async function changeTier(merchant: Merchant, riskTier: RiskTier) {
    if (inFlight.current.has(merchant.id)) return;
    if (riskTier === merchant.risk_tier) return;
    // This changes what tier a merchant is TREATED as, not their actual
    // verification status — there's no identity/KYC check behind this yet,
    // so the confirm copy says so rather than implying otherwise.
    if (
      !window.confirm(
        `Set ${merchant.name} (${merchant.email}) to "${riskTier}"?\n\nThis only changes which tier they're treated as — it does not perform any identity verification.`,
      )
    )
      return;

    const reason = promptForReason("change this merchant's tier", setError);
    if (reason === null) return;

    inFlight.current = true;
    setPendingId(merchant.id);
    setError("");
    const result = await apiPatch(`/admin/merchants/${merchant.id}/tier`, { risk_tier: riskTier, reason });
    if (result.ok) {
      await load();
    } else {
      reportError("admin.merchant.tier_change", { merchantId: merchant.id, riskTier, message: result.message });
      setError(result.message || "Could not change this merchant's tier.");
    }
    markPending(merchant.id, false);
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? merchants.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.stellar_base_address ?? "").toLowerCase().includes(q),
      )
    : merchants;

  return (
    <div>
      <h1 id="merchants-heading">Merchants</h1>

      <div className="admin-inline-form">
        <div className="field">
          <label htmlFor="merchants-search">Search</label>
          <input
            id="merchants-search"
            type="search"
            placeholder="Name, email, or Stellar address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <div className="empty">Could not load merchants — try again.</div>
        ) : visible.length === 0 ? (
          <div className="empty">{merchants.length === 0 ? "No merchants yet." : "No merchants match this search."}</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table" aria-labelledby="merchants-heading">
              <thead>
                <tr>
                  <th scope="col">Merchant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Risk tier</th>
                  <th scope="col">Stellar address</th>
                  <th scope="col">Created (UTC)</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{m.name}</div>
                      <div className="mono">{m.email}</div>
                    </td>
                    <td>
                      <span className={`status-pill ${m.status}`}>{m.status}</span>
                    </td>
                    <td>
                      <select
                        aria-label="Risk tier"
                        value={m.risk_tier}
                        disabled={pendingIds.has(m.id)}
                        onChange={(e) => changeTier(m, e.target.value as RiskTier)}
                      >
                        {RISK_TIERS.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{shortAddress(m.stellar_base_address)}</td>
                    <td className="mono">{formatDate(m.created_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pendingId === m.id}
                          onClick={() => sendPasswordReset(m)}
                        >
                          Send reset
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pendingId === m.id}
                          onClick={() => toggleStatus(m)}
                        >
                          {m.status === "suspended" ? "Reactivate" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && merchants.length > 0 && merchants.length % PAGE_SIZE === 0 && (
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
