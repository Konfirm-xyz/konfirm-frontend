"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

interface DailyVolumePoint {
  date: string;
  count: number;
}

interface AdminStats {
  total_users: number;
  total_posts: number;
  total_comments: number;
  daily_volume: DailyVolumePoint[];
}

function VolumeChart({ points }: { points: DailyVolumePoint[] }) {
  const width = 600;
  const height = 200;
  const padding = 24;

  if (!points || points.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="No volume data available"
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="4 4"
          rx={8}
        />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          fillOpacity={0.5}
          fontSize={14}
        >
          No volume data available
        </text>
      </svg>
    );
  }

  const max = Math.max(...points.map((p) => p.count), 1);
  const stepX = (width - padding * 2) / Math.max(points.length - 1, 1);
// A small hand-rolled SVG area chart — this app has no charting dependency,
// and one 7-point series doesn't need one. Real values in, real path out;
// nothing here is decorative.
function VolumeChart({
  points,
  totalUsdc,
}: {
  points: { date: string; net_usdc: string }[];
  totalUsdc: string;
}) {
  const width = 640;
  const height = 160;
  const padding = 8;

  // An empty report window (brand-new deployment, narrow date filter) yields
  // no points; guard before indexing so the admin page can't crash.
  if (points.length === 0) {
    return (
      <div className="empty" role="img" aria-label="Payment volume chart: no data for the last 7 days.">
        No volume data for this period.
      </div>
    );
  }

  const values = points.map((p) => Number(p.net_usdc));
  const max = Math.max(...values, 1);
  const step = (width - padding * 2) / (points.length - 1 || 1);

  const coords = values.map((v, i) => {
    const x = padding + i * step;
    const y = height - padding - (v / max) * (height - padding * 2);
    return [x, y];
  });

  const coords = points.map((p, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (p.count / max) * (height - padding * 2);
    return [x, y] as const;
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Daily volume chart">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="currentColor" />
      ))}
      <circle cx={last[0]} cy={last[1]} r={5} fill="currentColor" />
    </svg>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "admin") {
      router.push("/");
      return;
    }

    let cancelled = false;

    const loadStats = async () => {
      try {
        const data = await api.get<AdminStats>("/admin/stats");
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router, reloadKey]);

  if (authLoading || loading) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          <p className="text-sm opacity-60">Loading admin stats…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8 space-y-4">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8 space-y-8">
        <h1 className="text-2xl font-semibold">Admin Overview</h1>

      <div className="admin-section">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Merchants</div>
            <div className="stat-value">{stats.merchants.total.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value stat-good">{stats.merchants.active.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Suspended</div>
            <div className="stat-value stat-bad">{stats.merchants.suspended.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Payments today</div>
            <div className="stat-value">{stats.payments.today_count.toLocaleString()}</div>
            <div className="stat-sub">{formatAmount(stats.payments.today_net_usdc, "USDC")} net</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Blocked addresses</div>
            <div className="stat-value">{stats.compliance.blocked_count.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open cash-outs</div>
            <div className="stat-value">{stats.withdrawals.open_count.toLocaleString()}</div>
            <div className="stat-sub">not yet completed/errored per the anchor</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reconciler last moved</div>
            <div className="stat-value" style={{ fontSize: 15 }}>
              {stats.reconciler.updated_at ? formatDate(stats.reconciler.updated_at) : "—"}
            </div>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Daily Volume</h2>
          <VolumeChart points={stats?.daily_volume ?? []} />
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <p className="text-sm opacity-60">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
