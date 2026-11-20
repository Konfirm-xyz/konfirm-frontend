"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatUtcTimestamp } from "@/lib/format";

interface ReferralRow {
  id: string;
  code: string;
  created_at: string;
  referrer_name: string;
  referrer_email: string;
  referred_name: string;
  referred_email: string;
  activated: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PAGE_SIZE = 50;

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await apiFetch<ReferralRow[]>(`/admin/referrals?limit=${PAGE_SIZE}&offset=0`);
      if (result.ok && result.data) {
        setReferrals(result.data);
        setOffset(result.data.length);
        setHasMore(result.data.length === PAGE_SIZE);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const result = await apiFetch<ReferralRow[]>(`/admin/referrals?limit=${PAGE_SIZE}&offset=${offset}`);
    if (result.ok && result.data) {
      setReferrals((prev) => [...prev, ...result.data!]);
      setOffset((prev) => prev + result.data!.length);
      setHasMore(result.data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  return (
    <div>
      <h1>Referrals</h1>
      <p className="hint">
        &quot;Active&quot; means the referred merchant has processed at least one real paid payment — computed live
        against payment history, not a status a job has to keep up to date.
      </p>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="empty">Could not load referrals — try again.</div>
      ) : referrals.length === 0 ? (
        <div className="empty">No referrals yet.</div>
      ) : (
        <div className="admin-section">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Referrer</th>
                  <th>Referred</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{r.referrer_name}</div>
                      <div className="mono">{r.referrer_email}</div>
                    </td>
                    <td>
                      <div style={{ color: "var(--text-hi)" }}>{r.referred_name}</div>
                      <div className="mono">{r.referred_email}</div>
                    </td>
                    <td className="mono">{r.code}</td>
                    <td>
                      <span className={`status-pill ${r.activated ? "paid" : "pending"}`}>
                        {r.activated ? "Active" : "Signed up"}
                      </span>
                    </td>
                    <td>{formatUtcTimestamp(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 12 }}>
            Showing {referrals.length} referral{referrals.length === 1 ? "" : "s"}
            {hasMore ? " (there may be more)" : ""}
          </div>
          {hasMore && (
            <button className="btn" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 8 }}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
