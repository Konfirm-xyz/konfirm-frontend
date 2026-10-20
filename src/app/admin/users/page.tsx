"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UserRow {
  payer_address: string;
  payment_count: string;
  total_volume_usdc: string;
  first_seen_at: string;
  last_seen_at: string;
  refunded_count: string;
  disputed_count: string;
}

function formatUsdc(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await apiFetch<UserRow[]>("/admin/users");
      if (data) {
        setUsers(data);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

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
        <div className="empty">Loading…</div>
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
                    <td className="mono">{shortAddress(u.payer_address)}</td>
                    <td className="mono">{u.payment_count}</td>
                    <td className="mono">{formatUsdc(u.total_volume_usdc)}</td>
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
        </div>
      )}
    </div>
  );
}