"use client";

import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api";

type PaymentStatus = "paid" | "held" | "disputed";

interface Payment {
  id: string;
  amount_usdc: string;
  asset_code: string;
  payer_address: string;
  status: PaymentStatus;
  flag_reason: string | null;
  tx_hash: string;
  created_at: string;
  merchant_name: string;
  merchant_email: string;
}

const STATUS_OPTIONS: PaymentStatus[] = ["paid", "held", "disputed"];
const REASON_MAX_LENGTH = 500;

// Why the reconciler held a payment, in plain words for the reviewer.
const FLAG_LABEL: Record<string, string> = {
  no_session: "No payment link matched",
  amount_mismatch: "Amount differs from the link",
  asset_mismatch: "Different asset from the link",
  issuer_mismatch: "Asset issuer doesn't match (possible fake token)",
  link_inactive: "Link was deactivated",
  no_fixed_amount: "Open-amount link (not checkable)",
  blocked_address: "Payer is blocked",
  fee_leg_missing: "Platform fee not included",
};

function formatDate(iso: string): string {
  return formatUtc(iso);
}

function formatAmount(amount: string, code: string): string {
  return code === "USDC" ? `$${Number(amount).toFixed(2)}` : `${Number(amount).toFixed(2)} ${code}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<"" | PaymentStatus>("");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load(status: string) {
    setLoading(true);
    setError("");
    const url = status ? `${API_BASE}/admin/payments?status=${status}` : `${API_BASE}/admin/payments`;
    try {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Could not load payments — try again.");
      setPayments(await res.json());
    } catch (err) {
      console.error("[konfirm admin] payments load failed", err);
      setPayments([]);
      setError("Could not load payments — try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load(filter);
    })();
  }, [filter]);

  async function changeStatus(payment: Payment, status: PaymentStatus) {
    if (status === payment.status) return;

    const flagDescription = payment.flag_reason
      ? FLAG_LABEL[payment.flag_reason] ?? payment.flag_reason
      : null;
    const consequence =
      status === "paid" && (payment.status === "disputed" || payment.status === "held")
        ? `This will clear the "${payment.status}" flag${flagDescription ? ` (${flagDescription})` : ""} and mark the payment as paid.`
        : `This will change the payment status from "${payment.status}" to "${status}".`;
    if (!window.confirm(`${consequence}\n\nAre you sure?`)) return;

    const reason = window.prompt(
      `Reason for marking this payment "${status}" (required, shown in the activity log, max ${REASON_MAX_LENGTH} chars):`,
      ""
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required for every payment status change.");
      return;
    }
    if (reason.trim().length > REASON_MAX_LENGTH) {
      setError(`Reason must be ${REASON_MAX_LENGTH} characters or fewer (was ${reason.trim().length}).`);
      return;
    }

    setPendingId(payment.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/admin/payments/${payment.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not update this payment.");
      }
      await load(filter);
    } catch (err) {
      reportError(err, { scope: "admin-payments", action: "payment-status-change", paymentId: payment.id });
      setError(err instanceof Error ? err.message : "Could not update this payment.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <h1>Payments</h1>

      <div className="admin-inline-form">
        <div className="field">
          <label htmlFor="filter">Filter by status</label>
          <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value as "" | PaymentStatus)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : error && payments.length === 0 ? (
          <div className="empty">Could not load payments — try again.</div>
        ) : payments.length === 0 ? (
          <div className="empty">No payments match this filter.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Payer</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{p.merchant_name}</div>
                      <div className="mono">{p.merchant_email}</div>
                    </td>
                    <td className="mono">{formatAmount(p.amount_usdc, p.asset_code)}</td>
                    <td className="mono">{shortAddress(p.payer_address)}</td>
                    <td>
                      <span className={`status-pill ${p.status}`}>{p.status}</span>
                      {p.flag_reason && (
                        <div style={{ color: "var(--text-lo)", fontSize: 12, marginTop: 4 }}>
                          {FLAG_LABEL[p.flag_reason] ?? p.flag_reason}
                        </div>
                      )}
                    </td>
                    <td>{formatDate(p.created_at)}</td>
                    <td>
                      <select
                        value={p.status}
                        disabled={pendingId === p.id}
                        onChange={(e) => changeStatus(p, e.target.value as PaymentStatus)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && payments.length > 0 && <div className="status error">{error}</div>}
      </div>
    </div>
  );
}
