import type { Metadata } from "next";
import Link from "next/link";

// Static public explainer for the referral promo mechanic. No auth required
// — read-only, like /docs. Deliberately doesn't quote a specific fee rate,
// day count, or volume cap: those are set per-referral by an admin and shown
// live on /referrals (see PromoBanner there) rather than fixed values this
// page could drift out of sync with.
export const metadata: Metadata = {
  title: "Referral promo",
};

export default function ReferralPromoPage() {
  return (
    <div className="wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div className="header-row">
        <div className="brand">
          <span className="mark">✓</span> Konfirm
        </div>
      </div>

      <h1>Referral promo days</h1>
      <p className="sub">
        Refer another merchant to Konfirm, and they start with a limited-time promotional fee rate — no code to
        enter, no setup on their end.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>How it works</h2>
        <ol style={{ lineHeight: 1.8 }}>
          <li>
            Every merchant account gets a referral link automatically (find yours on the{" "}
            <Link href="/referrals">Referrals page</Link> once you&apos;re signed in).
          </li>
          <li>Share it. Anyone who signs up through your link is credited to you automatically.</li>
          <li>
            The referred merchant&apos;s account starts with a promotional fee rate for a limited number of days, or
            up to a processing volume cap — whichever comes first.
          </li>
          <li>
            Once the promo window or volume cap is reached, the account moves to standard fees. Nothing else
            changes, and no action is required.
          </li>
        </ol>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Checking your promo status</h2>
        <p>
          The exact rate, days remaining, and volume cap are specific to each account and set by Konfirm — they
          aren&apos;t fixed numbers we publish here. If you were referred, your current status is shown at the top of
          your own <Link href="/referrals">Referrals page</Link> once you log in: active rate and days left while the
          promo runs, or a plain note once it has ended and standard fees apply.
        </p>
      </section>

      <section style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e5e7eb)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-lo, #6b7280)" }}>
          Don&apos;t have an account yet? <Link href="/signup">Sign up</Link> — or ask the merchant who referred you
          for their link so the referral gets credited.
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--text-lo, #6b7280)", marginTop: "0.5rem" }}>
          Questions? Email <a href="mailto:support@konfirm.xyz">support@konfirm.xyz</a>.
        </p>
      </section>
    </div>
  );
}
