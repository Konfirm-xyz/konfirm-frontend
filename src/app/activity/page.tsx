"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_BASE, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { formatAmount } from "@/lib/format";
import { isTerminalAuthFailure } from "@/lib/poll";
import FeeSettlement from "@/components/fee-settlement";

type PaymentStatus = "paid" | "held" | "refunded" | "disputed";

interface Payment {
  id: string;
  net_usdc: string;
  asset_code: string;
  payer_address: string;
  link_description: string | null;
  status: PaymentStatus;
  flag_reason: string | null;
  fee_status: "none" | "collected" | "owed" | "claimed" | "settled";
  fee_owed_raw: string | null;
  fee_asset_code: string | null;
  created_at: string;
}

const STATUS_FILTERS: Array<{ value: "all" | PaymentStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "held", label: "Held" },
  { value: "refunded", label: "Refunded" },
  { value: "disputed", label: "Disputed" },
];

type DateRangePreset = "all" | "7" | "30" | "90";

const DATE_RANGE_FILTERS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

// Plain-language reasons for an admin-review hold, shown to the merchant.
// Anything unrecognised falls back to a neutral line rather than leaking an
// internal code name.
const HOLD_REASON_TEXT: Record<string, string> = {
  amount_mismatch: "Amount didn't match the payment link — under review",
  asset_mismatch: "Paid in a different asset than the link — under review",
  issuer_mismatch: "Asset didn't match the expected token — under review",
  no_session: "Not linked to a payment link — under review",
  link_inactive: "Link was deactivated before this payment — under review",
  no_fixed_amount: "Open-amount link — under review",
  blocked_address: "Payer flagged by compliance — under review",
};
const HOLD_FALLBACK = "Held for review";

// How many consecutive failed polls before we stop claiming to be "live" and
// warn the merchant. A single blip shouldn't flash a scary banner.
const POLL_FAILURE_THRESHOLD = 2;

interface Merchant {
  name: string;
  stellar_base_address: string | null;
}

// The dashboard is only ever the logged-in merchant's own data. There's no
// address-in-the-URL view any more: the backend returns payments by session,
// so an unauthenticated visitor sees nothing.
function ActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdminPreview = Boolean(searchParams.get("admin_preview"));
  const { resolved, data: merchant } = useRequireAuth<Merchant>({
    meEndpoint: "/auth/me",
    loginPath: "/login",
    select: (body) => (body as { merchant: Merchant }).merchant,
  });

  const hasAddress = Boolean(merchant?.stellar_base_address);
  const showNav = Boolean(merchant);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pending, setPending] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [dateFilter, setDateFilter] = useState<DateRangePreset>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const consecutiveFailures = useRef(0);

  const poll = useCallback(async () => {
    if (!hasAddress) return;
    try {
      const [paymentsRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE}/payments/mine`),
        fetch(`${API_BASE}/payments/mine/pending`),
      ]);
      // A 401 means the session is gone — retrying will never fix it. Redirect
      // to login (same pattern as useRequireAuth) instead of feeding it into
      // the transient-failure counter and showing a generic "poll error".
      if (isTerminalAuthFailure(paymentsRes.status) || isTerminalAuthFailure(pendingRes.status)) {
        router.push("/login");
        return;
      }
      if (!paymentsRes.ok || !pendingRes.ok) {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= POLL_FAILURE_THRESHOLD) setPollError(true);
        return;
      }
      const paymentsBody: Payment[] = await paymentsRes.json();
      const pendingBody = await pendingRes.json();
      setPayments(paymentsBody);
      setPending(Boolean(pendingBody.pending));
      setNow(Date.now());
      consecutiveFailures.current = 0;
      setPollError(false);
    } catch {
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= POLL_FAILURE_THRESHOLD) setPollError(true);
    }
  }, [hasAddress, router]);

  // The recursive scheduling lives here, in a plain local function, rather
  // than inside the `poll` callback referencing itself — a useCallback
  // can't safely call itself by name before its own declaration finishes
  // binding on each render.
  //
  // Polling is visibility-aware: a background tab doesn't need live updates,
  // so we stop the loop while `document.hidden` and resume (with an immediate
  // re-poll) when the tab becomes visible again. This keeps a dashboard left
  // open all day from generating continuous backend load.
  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(loop, 3000);
    }

    async function loop() {
      if (cancelled) return;
      if (document.hidden) return;
      await poll();
      if (!cancelled) schedule();
    }

    function handleVisibility() {
      if (cancelled) return;
      if (document.hidden) {
        clearTimeout(timer);
      } else {
        // Resume and immediately re-poll so the merchant sees fresh data.
        clearTimeout(timer);
        loop();
      }
    }

    loop();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resolved, poll]);

  async function handleLogout() {
    await apiPost("/auth/logout");
    router.push("/login");
  }

  // Held payments are listed but never counted as received until an admin
  // clears them.
  const totals: Record<string, number> = {};
  payments
    .filter((p) => p.status === "paid")
    .forEach((p) => {
      totals[p.asset_code] = (totals[p.asset_code] || 0) + Number(p.net_usdc);
    });
  const hasBalances = Object.keys(totals).length > 0;

  const filteredPayments = useMemo(() => {
    const reference = now ?? 0;
    const dateCutoff = dateFilter === "all" ? null : reference - Number(dateFilter) * 24 * 60 * 60 * 1000;
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (dateCutoff !== null && new Date(p.created_at).getTime() < dateCutoff) return false;
      return true;
    });
  }, [payments, statusFilter, dateFilter, now]);

  // Gate render on auth resolution — prevents a false "$0.00 received" from
  // flashing before the first fetch completes (#135), and holds off
  // rendering the dashboard shell (nav, actions, fee settlement) until the
  // client-side auth check resolves — the edge proxy only checks cookie
  // presence, so an expired session would otherwise briefly expose a fully
  // interactive page. Placed after every hook above (not before) so hook
  // call order stays identical across renders.
  if (!resolved) {
    return (
      <div className="wrap">
        <div className="header-row">
          <div className="brand">
            <span className="mark">✓</span> Konfirm
          </div>
        </div>
        <div className="empty">Loading…</div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {isAdminPreview && (
        <div
          role="banner"
          style={{
            background: "var(--warn, #b45309)",
            color: "#fff",
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Admin preview — viewing as merchant
        </div>
      )}
      {pollError && (
        <div
          role="alert"
          style={{
            background: "var(--warn, #b45309)",
            color: "#fff",
            padding: "10px 16px",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Having trouble reaching the server — retrying…
        </div>
      )}
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
        {showNav && (
          <div className="nav-actions">
            <Link href="/dashboard" className="btn secondary">
              Dashboard
            </Link>
            <button className="btn secondary" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
      <h1>Activity</h1>
      <p className="sub">Live payments as they arrive.</p>

      {hasBalances && (
        <div className="totals">
          {Object.entries(totals).map(([asset, amount]) => (
            <div key={asset} className="total-card">
              <div className="total-label">{asset} received</div>
              <div className="total-amount">{formatAmount(amount, asset)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="filters">
        <div className="filter-group">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`chip ${statusFilter === f.value ? "active" : ""}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {DATE_RANGE_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`chip ${dateFilter === f.value ? "active" : ""}`}
              onClick={() => setDateFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredPayments.length === 0 ? (
        <div className="empty">No payments yet.</div>
      ) : (
        <div className="list">
          {filteredPayments.map((p) => (
            <div key={p.id} className="row">
              <button
                className="row-main"
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              >
                <span className="row-amount">{formatAmount(Number(p.net_usdc), p.asset_code)}</span>
                <span className={`badge ${p.status}`}>{p.status}</span>
                {p.link_description && <span className="row-desc">{p.link_description}</span>}
              </button>
              {expandedId === p.id && (
                <div className="row-detail">
                  <div>
                    <strong>Payer:</strong> {p.payer_address}
                  </div>
                  <div>
                    <strong>Received:</strong> {new Date(p.created_at).toLocaleString()}
                  </div>
                  {p.status === "held" && (
                    <div className="hold-reason">
                      {HOLD_REASON_TEXT[p.flag_reason ?? ""] ?? HOLD_FALLBACK}
                    </div>
                  )}
                  {p.fee_status !== "none" && (
                    <FeeSettlement
                      feeStatus={p.fee_status}
                      feeOwedRaw={p.fee_owed_raw}
                      feeAssetCode={p.fee_asset_code}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <ActivityContent />
    </Suspense>
  );
}
