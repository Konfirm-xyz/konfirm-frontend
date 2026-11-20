"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";
import { apiPost } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [mismatch, setMismatch] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      setStatus("The two passwords don't match.");
      return;
    }
    setMismatch(false);
    setSubmitting(true);
    setStatus("");
    try {
      await apiPost("/auth/reset-password", { token, password });
      router.push("/login");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not reset your password. Please try again.");
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="sub">
        This reset link is incomplete. <Link href="/forgot-password">Request a new one</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="password">New password</label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={mismatch || Boolean(status)}
          aria-describedby={status ? "form-status" : undefined}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm new password</label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || Boolean(status)}
          aria-describedby={status ? "form-status" : undefined}
        />
      </div>
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Setting password…" : "Set new password"}
      </button>
      <div
        id="form-status"
        className={`status${status ? " error" : ""}`}
        role="alert"
        aria-live={status ? "assertive" : "polite"}
      >
        {status}
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="page-center">
      <div className="card narrow">
        <div className="brand" style={{ marginBottom: 24 }}>
          <span className="mark">✓</span> Konfirm
        </div>
        <h1 style={{ marginBottom: 22 }}>Choose a new password</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
        <div className="footer">
          <Link href="/login">Back to log in</Link>
        </div>
      </div>
    </div>
  );
}
