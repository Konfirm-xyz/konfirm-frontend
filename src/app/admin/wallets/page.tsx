"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface WalletRow {
  address: string;
  roles: string[];
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const ROLE_LABELS: Record<string, string> = {
  payer: "Payer",
  merchant: "Merchant",
  blocked: "Blocked",
};

export default function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const data = await apiFetch<WalletRow[]>("/admin/wallets");
      if (data) {
        setWallets(data);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1>Wallets</h1>
      <p className="hint">
        Every Stellar address seen across payments, merchant accounts, and the compliance blocklist, in one directory
        — an address showing both &quot;Payer&quot; and &quot;Blocked&quot; is worth a second look.
      </p>

      <div className="admin-inline-form">
        <div className="field">
          <label htmlFor="wallets-search">Search by address</label>
          <input
            id="wallets-search"
            type="search"
            placeholder="Stellar address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 240 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : error ? (
        <div className="empty">Could not load wallets — try again.</div>
      ) : wallets.length === 0 ? (
        <div className="empty">No addresses seen yet.</div>
      ) : (
        <div className="admin-section">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Roles</th>
                </tr>
              </thead>
              <tbody>
                {wallets.filter((w) => {
                  if (!search.trim()) return true;
                  return w.address.toLowerCase().includes(search.trim().toLowerCase());
                }).map((w) => (
                  <tr key={w.address}>
                    <td className="mono">{shortAddress(w.address)}</td>
                    <td>
                      {w.roles.map((role) => (
                        <span key={role} className={`status-pill ${role === "blocked" ? "disputed" : "paid"}`} style={{ marginRight: 6 }}>
                          {ROLE_LABELS[role] ?? role}
                        </span>
                      ))}
                    </td>
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
