"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatUtcTimestamp } from "@/lib/format";

interface FeeOwed {
  id: string;
  currency: string;
  amount: string;
  merchant_name: string;
  merchant_email: string;
  created_at: string;
}

export default function AdminFeesOwedPage() {
  const [fees, setFees] = useState<FeeOwed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true);
    const result = await apiFetch<FeeOwed[]>("/admin/fees-owed");
    if (result.ok && result.data) {
      setFees(result.data);
      setError(false);
    } else {
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load(true);
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  return (
    <div>
      <h1>Fees Owed</h1>
      <p className="sub">
        Outstanding fees change continuously as payments settle. Refresh to pull the latest amounts.
      </p>

      <div className="admin-section">
        <button type="button" onClick={handleRefresh} disabled={refreshing} style={{ width: "auto", marginBottom: 16 }}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="empty">Could not load fees owed — try again.</div>
        ) : fees.length === 0 ? (
          <div className="empty">No outstanding fees.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Currency</th>
                  <th>Amount</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{f.merchant_name}</div>
                      <div className="mono">{f.merchant_email}</div>
                    </td>
                    <td>{f.currency}</td>
                    <td className="mono">{f.amount}</td>
                    <td>{formatUtcTimestamp(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
