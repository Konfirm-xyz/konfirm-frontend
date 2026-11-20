'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface PaymentLink {
  id: string;
  url: string;
  amount: number;
  description: string | null;
  active: boolean;
  createdAt: string;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function LinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/links', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load links (${res.status})`);
      }
      const data = await res.json();
      const items: PaymentLink[] = Array.isArray(data) ? data : data.links ?? [];
      setLinks(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState only runs after the await inside loadLinks(), not synchronously in the effect
    void loadLinks();
  }, [loadLinks]);

  const handleCopy = useCallback(async (link: PaymentLink) => {
    setCopyErrorId(null);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link.url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link.url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) {
          throw new Error('Copy command failed');
        }
      }
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === link.id ? null : current));
      }, 2000);
    } catch {
      setCopyErrorId(link.id);
    }
  }, []);

  const handleDeactivate = useCallback(
    async (link: PaymentLink) => {
      if (!window.confirm('Deactivate this payment link? It will no longer be payable.')) {
        return;
      }
      setDeactivatingId(link.id);
      setError(null);
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(link.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ active: false }),
        });
        if (!res.ok) {
          throw new Error(`Failed to deactivate link (${res.status})`);
        }
        setLinks((current) =>
          current.map((item) => (item.id === link.id ? { ...item, active: false } : item)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to deactivate link');
      } finally {
        setDeactivatingId(null);
      }
    },
    [],
  );

  return (
    <div className="wrap">
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
        <div className="nav">
          <Link href="/activity">Activity</Link>
          <Link href="/new">+ New payment</Link>
        </div>
      </div>
      <h1>My payment links</h1>
      <p className="sub">Every link you&apos;ve created, and whether it can still be paid.</p>

      {error && (
        <div role="alert" className="callout" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty">Loading links…</div>
      ) : links.length === 0 ? (
        <div className="empty">
          No payment links yet.
          <br />
          <Link href="/new" className="btn-primary" style={{ marginTop: 16 }}>
            Create a payment link
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {links.map((link) => (
            <li key={link.id} className="payment" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                <div className="desc">
                  <div className="amount" style={{ fontSize: 16 }}>{formatAmount(link.amount)}</div>
                  {link.description && <div>{link.description}</div>}
                  <div className="from">
                    Created {formatDate(link.createdAt)}
                    {!link.active && (
                      <span className="status-pill inactive" style={{ marginLeft: 8 }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => void handleCopy(link)}>
                    {copiedId === link.id ? "Copied!" : "Copy link"}
                  </button>
                  {link.active && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ color: "var(--error)", borderColor: "var(--error)" }}
                      onClick={() => void handleDeactivate(link)}
                      disabled={deactivatingId === link.id}
                    >
                      {deactivatingId === link.id ? "Deactivating…" : "Deactivate"}
                    </button>
                  )}
                </div>
              </div>
              <div className="from mono" style={{ wordBreak: "break-all", marginTop: 8 }}>{link.url}</div>
              {copyErrorId === link.id && (
                <div className="from" style={{ color: "var(--error)" }}>
                  Couldn&apos;t copy automatically — select the link above and copy it manually.
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}