"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

function formatDate(iso: string): string {
  return formatUtcTimestamp(iso);
}

function shortAddress(address: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoadError(false);
    try {
      const data = await apiFetch<Merchant[]>("/admin/merchants");
      if (data === null) {
        setLoadError(true);
      } else {
        setMerchants(data);
      }
    } catch (err) {
      console.error("[konfirm admin] merchants load failed", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function sendPasswordReset(merchant: Merchant) {
    if (!window.confirm(`Email a password-reset link to ${merchant.email}?`)) return;
    const reason = window.prompt("Why? Required, shown in the activity log:", "");
    if (!reason || reason.trim().length < 3) {
      setError("A reason of at least 3 characters is needed to send a reset.");
      return;
    }
    setPendingId(merchant.id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/merchants/${merchant.id}/password-reset`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not send the reset email.");
      }
      setError("");
      window.alert(`Reset link sent to ${merchant.email}.`);
    } catch (err) {
      reportError(err, { action: "admin.merchant.password_reset", merchantId: merchant.id });
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleStatus(merchant: Merchant) {
    const nextStatus = merchant.status === "suspended" ? "active" : "suspended";
    const verb = nextStatus === "suspended" ? "suspend" : "reactivate";
    if (!window.confirm(`${verb === "suspend" ? "Suspend" : "Reactivate"} ${merchant.name} (${merchant.email})?`)) return;

    let reason: string | null = "";
    if (verb === "suspend") {
      reason = window.prompt("Reason (optional, shown in the activity log):", "");
      if (reason === null) return;
    }

    setPendingId(merchant.id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/merchants/${merchant.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: reason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Could not ${verb} this merchant.`);
      }
      await load();
    } catch (err) {
      reportError(err, { action: "admin.merchant.status_change", merchantId: merchant.id, status: nextStatus });
      setError(err instanceof Error ? err.message : `Could not ${verb} this merchant.`);
    } finally {
      setPendingId(null);
    }
  }

  async function changeTier(merchant: Merchant, riskTier: RiskTier) {
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

    setPendingId(merchant.id);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/merchants/${merchant.id}/tier`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risk_tier: riskTier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not change this merchant's tier.");
      }
      await load();
    } catch (err) {
      reportError(err, { action: "admin.merchant.tier_change", merchantId: merchant.id, riskTier });
      setError(err instanceof Error ? err.message : "Could not change this merchant's tier.");
    } finally {
      setPendingId(null);
    }
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
      <h1>Merchants</h1>

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
          <div className="empty">Loading…</div>
        ) : loadError ? (
          <div className="empty">Could not load merchants — try again.</div>
        ) : visible.length === 0 ? (
          <div className="empty">{merchants.length === 0 ? "No merchants yet." : "No merchants match this search."}</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Status</th>
                  <th>Risk tier</th>
                  <th>Stellar address</th>
                  <th>Created (UTC)</th>
                  <th></th>
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
                        value={m.risk_tier}
                        disabled={pendingId === m.id}
                        onChange={(e) => changeTier(m, e.target.value as RiskTier)}
                      >
                        {RISK_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{shortAddress(m.stellar_base_address)}</td>
                    <td>{formatDate(m.created_at)}</td>
                    <td>
                      <button type="button" disabled={pendingId === m.id} onClick={() => toggleStatus(m)}>
                        {m.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>{" "}
                      <button
                        type="button"
                        disabled={pendingId === m.id || m.status !== "active"}
                        onClick={() => sendPasswordReset(m)}
                        title={m.status !== "active" ? "Reactivate the account first" : undefined}
                      >
                        Send reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  );
}