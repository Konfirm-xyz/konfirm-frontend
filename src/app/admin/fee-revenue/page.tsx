"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Summary {
  payment_count: number;
  total_fee_usdc: string;
}

interface DailyRow {
  day: string;
  payment_count: string;
  fee_usdc: string;
}

function formatUsdc(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function formatDay(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, { timeZone: "UTC" })} UTC`;
}

export default function AdminFeeRevenuePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const [summaryData, dailyData] = await Promise.all([
        apiFetch<Summary>("/admin/fee-revenue/summary"),
        apiFetch<DailyRow[]>("/admin/fee-revenue/daily"),
      ]);
      if (summaryData) setSummary(summaryData);
      if (dailyData) setDaily(dailyData);
      setError(!summaryData || !dailyData);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1>Fee Revenue</h1>
      <p className="hint">
        Realized fee revenue only counts payments that actually settled (status = paid) — a refunded or disputed
        payment&apos;s fee was never really earned, so it&apos;s excluded here.
      </p>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className="admin-section">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Total fee revenue</div>
                <div className="stat-value">{summary ? formatUsdc(summary.total_fee_usdc) : "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Paid transactions</div>
                <div className="stat-value">{summary ? summary.payment_count.toLocaleString() : "—"}</div>
              </div>
            </div>
          </div>

          <div className="admin-section">
            {error ? (
              <div className="empty">Could not load fee revenue — try again.</div>
            ) : daily.length === 0 ? (
              <div className="empty">No settled payments in the last 30 days.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day (UTC)</th>
                      <th>Payments</th>
                      <th>Fee revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((row) => (
                      <tr key={row.day}>
                        <td>{formatDay(row.day)}</td>
                        <td className="mono">{row.payment_count}</td>
                        <td className="mono">{formatUsdc(row.fee_usdc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}