"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { formatAmount, formatUtcTimestamp } from "@/lib/format";

interface UserRow {
  payer_address: string;
  payment_count: string;
  total_volume_usdc: string;
  first_seen_at: string;
  last_seen_at: string;
  refunded_count: string;
  disputed_count: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/admin/users?limit=${PAGE_SIZE}&offset=0`, { credentials: "include" });
      if (res.ok) {
        const rows: UserRow[] = await res.json();
        setUsers(rows);
        setOffset(rows.length);
        setHasMore(rows.length === PAGE_SIZE);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const res = await fetch(`${API_BASE}/admin/users?limit=${PAGE_SIZE}&offset=${offset}`, { credentials: "include" });
    if (res.ok) {
      const rows: UserRow[] = await res.json();
      setUsers((prev) => [...prev, ...rows]);
      setOffset((prev) => prev + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }

  const q = search.trim().toLowerCase();
  const visible = q ? users.filter((u) => u.payer_address.toLowerCase().includes(q)) : users;

  return (
    <div>
      <h1>Users</h1>
      <p className="hint">
        There&apos;s no separate user-account system — this is every unique address that has ever paid through the
        platform, derived from payment history, not a signed-up account.
      </p>

      <div className="admin-inline-form">
        <div className="field">
          <label htmlFor="users-search">Search by address</label>
          <input
            id="users-search"
            type="search"
            placeholder="Stellar payer address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="empty">Could not load users — try again.</div>
      ) : visible.length === 0 ? (
        <div className="empty">{users.length === 0 ? "No payer activity yet." : "No users match this search."}</div>
      ) : (
        <div className="admin-section">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Payments</th>
                  <th>Total volume</th>
                  <th>Refunded / disputed</th>
                  <th>First seen (UTC)</th>
                  <th>Last seen (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.payer_address}>
                    <td className="mono" title={u.payer_address}>{shortAddress(u.payer_address)}</td>
                    <td className="mono">{u.payment_count}</td>
                    <td className="mono">{formatAmount(u.total_volume_usdc, "USDC")}</td>
                    <td className="mono">
                      {u.refunded_count} / {u.disputed_count}
                    </td>
                    <td>{formatUtcTimestamp(u.first_seen_at)}</td>
                    <td>{formatUtcTimestamp(u.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-pagination">
            <span className="hint">
              Showing {users.length} of {hasMore ? `${users.length}+` : users.length}
            </span>
            {hasMore && (
              <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}