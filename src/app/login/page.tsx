"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // Surface a distinct banner when the user was bounced here by a real
  // session expiry (401), as opposed to a backend outage or network error.
  const reason = searchParams.get("reason");
  const sessionExpired = reason === "session_expired";

  // Preserve the return path so a bounced user lands back where they were
  // (e.g. /new with a restored draft) instead of the default /activity.
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/activity";

  // Already-authenticated visitors shouldn't see the login form — bounce
  // them straight to the app instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (!cancelled && res.ok) {
          router.replace(nextPath);
        }
      } catch {
        // Ignore — just means we stay on the login page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "Login failed");
        return;
      }
      router.push(nextPath);
    } catch (err) {
      reportError("login", err);
      setStatus(err instanceof Error ? err.message : "Could not log in. Please try again.");
    } finally {
      setLoading(false);
    }
    }
  }

  const invalid = Boolean(status);

  return (
    <main className="auth">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? "form-status" : undefined}
          />
        </div>
        <h1 style={{ marginBottom: 22 }}>Log in</h1>
        {sessionExpired && (
          <div className="status error" role="alert" aria-live="assertive" style={{ marginBottom: 16 }}>
            Your session expired. Please log in again.
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              maxLength={72}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
          <div
            className={`status${status ? " error" : ""}`}
            role="alert"
            aria-live={status ? "assertive" : "polite"}
          >
            {status}
          </div>
        </form>
        <div className="footer">
          <Link href="/forgot-password">Forgot your password?</Link>
          <br />
          New here? <Link href="/signup">Create an account</Link>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
        <div id="form-status" className={`status${status ? " error" : ""}`}>
          {status}
        </div>
      </form>
      <p className="muted">
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
