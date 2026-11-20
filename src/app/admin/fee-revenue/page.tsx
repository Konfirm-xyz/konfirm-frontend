"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

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

// Client-side CSV export from the already-loaded daily rows (#20).
function downloadCsv(rows: DailyRow[]) {
  const header = "Day (UTC),Payments,Fee Revenue (USD)";
  const lines = rows.map((r) => `${r.day},${r.payment_count},${Number(r.fee_usdc).toFixed(2)}`);
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fee-revenue.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminFeeRevenuePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const [summaryResult, dailyResult] = await Promise.all([
        apiFetch<Summary>("/admin/fee-revenue/summary"),
        apiFetch<DailyRow[]>("/admin/fee-revenue/daily"),
      ]);
      if (summaryResult.ok && summaryResult.data) setSummary(summaryResult.data);
      if (dailyResult.ok && dailyResult.data) setDaily(dailyResult.data);
      setError(!summaryResult.ok || !dailyResult.ok);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1>Fee Revenue</h1>
        {!loading && daily.length > 0 && (
          <button type="button" onClick={() => downloadCsv(daily)}>
            Download CSV
          </button>
        )}
      </div>
      <p className="hint">
        Realized fee revenue only counts payments that actually settled (status = paid) — a refunded or disputed
        payment&apos;s fee was never really earned, so it&apos;s excluded here.
      </p>

      {loading ? (
        <LoadingSpinner stallThreshold={3000} />
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
