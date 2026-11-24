"use client";
import LoadingSpinner from "@/components/LoadingSpinner";

import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { formatUtcTimestamp } from "@/lib/format";

type RiskTier = "unverified" | "standard" | "established" | "enterprise";

interface BlockedAddress {
  id: string;
  stellar_address: string;
  reason: string;
  blocked_at: string;
}

const REASON_MAX_LENGTH = 500;

function formatDate(iso: string): string {
  return formatUtcTimestamp(iso);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function AdminCompliancePage() {
  const [blocked, setBlocked] = useState<BlockedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);

  async function load() {
    const result = await apiFetch<BlockedAddress[]>("/admin/compliance/blocked-addresses");
    if (result.ok && result.data) {
      setBlocked(result.data);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function handleUnblock(entry: BlockedAddress) {
    if (!window.confirm(`Unblock ${entry.stellar_address}?`)) return;

    const reason = window.prompt(
      `Reason (optional, shown in the activity log, max ${REASON_MAX_LENGTH} chars):`,
      ""
    );
    if (reason === null) return;
    if (reason.trim().length > REASON_MAX_LENGTH) {
      setError(`Reason must be ${REASON_MAX_LENGTH} characters or fewer (was ${reason.trim().length}).`);
      return;
    }

    setPendingId(entry.id);
    setError("");
    const result = await apiFetch(`/admin/compliance/blocked-addresses/${entry.id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    if (result.ok) {
      await load();
    } else {
      reportError("admin.compliance.unblock", { entryId: entry.id, message: result.message });
      setError(result.message || "Could not unblock this address.");
    }
    setPendingId(null);
  }

  return (
    <div>
      <h1>Compliance</h1>

      <div className="admin-section">
        {loading ? (
          <LoadingSpinner />
        ) : loadError ? (
          <div className="empty">Could not load blocked addresses — try again.</div>
        ) : blocked.length === 0 ? (
          <div className="empty">No blocked addresses.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Address</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Blocked (UTC)</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono">{shortAddress(entry.stellar_address)}</td>
                    <td>{entry.reason}</td>
                    <td>{formatDate(entry.blocked_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={pendingId === entry.id}
                        onClick={() => handleUnblock(entry)}
                      >
                        {pendingId === entry.id ? "Unblocking…" : "Unblock"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
