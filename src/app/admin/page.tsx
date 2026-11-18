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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Users" value={stats?.total_users ?? 0} />
          <StatCard label="Posts" value={stats?.total_posts ?? 0} />
          <StatCard label="Comments" value={stats?.total_comments ?? 0} />
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
