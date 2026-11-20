import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";

// Merchant session cookie — kept in sync by hand with the identically-named
// constant in proxy.ts (MERCHANT_COOKIE). This is the same cheap,
// edge-level *presence* check proxy.ts already uses, not a real auth
// verification: it only decides whether to show the public landing page
// below or send a returning visitor straight back into the login→/activity
// bounce that already exists today (see login/page.tsx's useEffect, which
// calls the real /auth/me check). An expired/invalid cookie still ends up
// on /login and gets redirected again by that real check — same outcome as
// before this file changed.
const MERCHANT_COOKIE = "konfirm_session";

const MAP_NODES = [
  {
    title: "A link is created",
    body: "Set an amount in XLM, USDC, or EURC and share the link.",
  },
  {
    title: "Customer pays on Stellar",
    body: "A classic transfer or SEP-7 wallet link, straight to the ledger.",
  },
  {
    title: "A reconciler checks Horizon",
    body: "Independently verified against Stellar's own network API before anything is marked paid.",
  },
  {
    title: "Paid. Settled to your treasury",
    body: "Through your own 2-of-3 multisig. Konfirm never holds the key alone.",
  },
] as const;

// Confirmation rings: the real shape of a reconciled payment -- each ring
// a step of verification (link created, paid, checked against Horizon,
// settled), converging on one confirmed center, with a tight cluster of
// settled payments marked right at the middle. Reinterpreted from a
// reference photo of a shooting target pasted into this session (the
// rings-converging-on-a-center idea, not the photo itself, which showed
// a firearm and a real range -- not this product's material) and built
// in the same "Stripe hero motion" spirit as the ribbon it replaces: a
// continuous animated confirmation ping, not a static image (80, 29).
// Deterministic offsets, not Math.random(), so server and client render
// the same markup.
const RING_RADII = [40, 80, 120, 160, 200, 240] as const;
const CONFIRMATION_RINGS = RING_RADII.map((r, i) => ({
  id: `ring${i}`,
  r,
  t: i / (RING_RADII.length - 1),
}));
const SETTLED_HITS = [
  { id: "hit0", dx: -6, dy: 10 },
  { id: "hit1", dx: 4, dy: 15 },
  { id: "hit2", dx: -2, dy: 23 },
] as const;
const PING_RINGS = [0, 1, 2].map((i) => ({ id: `ping${i}`, delay: i * 2 }));

// Two independent, script-off-safe enhancements: the nav retracts on
// scroll-down and returns on scroll-up (never hides what it doesn't need
// to -- it's always visible without this running), and the map's four
// cards ink in once, staggered, as they enter view. Both are
// transform/opacity only (10a) and both leave the page fully visible if
// the script never runs (62).
const LANDING_SCRIPT = `
document.documentElement.classList.add('js');
(function () {
  var nav = document.querySelector('.landing .site-nav');
  if (!nav) return;
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y > lastY && y > 120) nav.classList.add('is-hidden');
    else nav.classList.remove('is-hidden');
    lastY = y;
  }, { passive: true });
})();
(function () {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
})();
`;

export default async function RootPage() {
  const cookieStore = await cookies();
  if (cookieStore.has(MERCHANT_COOKIE)) {
    redirect("/login");
  }

  return (
    <article className="landing">
      <p className="top-banner">Live on Stellar testnet today. Mainnet is next.</p>

      <nav className="site-nav" aria-label="Primary">
        <div className="container nav-row">
          <div className="nav-brand">
            <Link href="/" className="wordmark" aria-label="Konfirm, home">
              Konfirm
            </Link>
            <a
              className="stellar-badge"
              href="https://stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Built on Stellar (opens stellar.org)"
            >
              <img src="https://cdn.simpleicons.org/stellar/FDDA24" alt="" width={14} height={14} aria-hidden="true" />
              <span>Built on Stellar</span>
            </a>
          </div>
          <div className="nav-actions">
            <Link href="/login">Log in</Link>
            <Link href="/signup" className="btn">
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container">
          <div className="hero-stats" data-reveal style={{ "--i": 0 } as CSSProperties}>
            <div>
              <b>2-of-3</b>
              <span>multisig treasury on every payout</span>
            </div>
            <div>
              <b>100%</b>
              <span>of payments reconciled on-chain</span>
            </div>
            <div>
              <b>$0</b>
              <span>ever held by Konfirm</span>
            </div>
          </div>
          <div className="hero-row">
            <div className="hero-text">
              <h1 data-reveal style={{ "--i": 1 } as CSSProperties}>
                Paid only when the ledger says so.
              </h1>
              <p className="lead" data-reveal style={{ "--i": 2 } as CSSProperties}>
                Non-custodial payments on Stellar, verified on-chain before anything is marked paid.
              </p>
              <div className="hero-actions" data-reveal style={{ "--i": 3 } as CSSProperties}>
                <Link href="/signup" className="btn">
                  Create a merchant account
                </Link>
                <Link href="/login" className="btn btn--quiet">
                  Log in
                </Link>
              </div>
              <p className="hero-note" data-reveal style={{ "--i": 4 } as CSSProperties}>
                No card, no custody, ever.
              </p>
            </div>
            <svg
              className="hero-target"
              viewBox="-280 -280 560 560"
              aria-hidden="true"
              data-reveal
              style={{ "--i": 2 } as CSSProperties}
            >
              <g className="hero-target__core">
                <circle r={10} />
              </g>
              {PING_RINGS.map((p) => (
                <g key={p.id} className="hero-target__ping" style={{ "--delay": `${p.delay}s` } as CSSProperties}>
                  <circle r={RING_RADII[0]} />
                </g>
              ))}
              {CONFIRMATION_RINGS.map((ring) => (
                <circle
                  key={ring.id}
                  className="hero-target__ring"
                  r={ring.r}
                  style={{
                    stroke: `color-mix(in oklab, var(--color-accent) ${(1 - ring.t) * 100}%, var(--color-accent-2) ${ring.t * 100}%)`,
                  }}
                />
              ))}
              <g className="hero-target__hits">
                {SETTLED_HITS.map((hit) => (
                  <circle key={hit.id} cx={hit.dx} cy={hit.dy} r={4} />
                ))}
              </g>
            </svg>
          </div>
        </div>
      </section>

      <section className="map" aria-labelledby="map-head">
        <div className="container">
          <h2 id="map-head">How a payment actually gets marked paid</h2>
          <ol className="map-diagram">
            {MAP_NODES.map((node, i) => (
              <li key={node.title} className="map-node" data-reveal style={{ "--i": i } as CSSProperties}>
                <div className={`map-card${i === MAP_NODES.length - 1 ? " map-card--paid" : ""}`}>
                  <span className="map-card__num">{i + 1}</span>
                  <h3>{node.title}</h3>
                  <p>{node.body}</p>
                  {i === MAP_NODES.length - 1 && (
                    <span className="map-stamp" aria-hidden="true">
                      Paid
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="proof">
        <div className="container">
          <h2>Custody you can verify</h2>
          <div className="stats">
            <div>
              <b>2-of-3</b>
              <span>Your treasury signs every payout. No single key controls it.</span>
            </div>
            <div>
              <b>100%</b>
              <span>Independently reconciled against Horizon before it&apos;s marked paid.</span>
            </div>
            <div>
              <b>$0</b>
              <span>Funds settle straight to your own Stellar address, never Konfirm&apos;s.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="code">
        <div className="container code-row">
          <div className="code-text">
            <h2>Every link is just a request</h2>
            <p>
              An amount, a currency, an optional description: that&apos;s the whole shape of a Konfirm payment
              link. Set a usage limit or an expiry if you need one.
            </p>
          </div>
          <pre className="code-sample">
            <code>{`POST /links
{
  "amount_usdc": "25.00",
  "currency": "USDC",
  "description": "Order #1042"
}`}</code>
          </pre>
        </div>
      </section>

      <section className="who">
        <div className="container who-grid">
          <article className="who-card">
            <h3>For merchants</h3>
            <ul>
              <li>Accept XLM, USDC, or EURC on a payment link</li>
              <li>Customers pay with a SEP-7 wallet deep link they already know</li>
              <li>Payouts settle straight to your own treasury</li>
            </ul>
          </article>
          <article className="who-card">
            <h3>For builders &amp; agents</h3>
            <ul>
              <li>Open a Soroban payment channel between two agents</li>
              <li>Commit micropayments off-chain, as many times as you need</li>
              <li>Settle once on-chain, no matter how many commits happened in between</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="container">
          <h2>Questions worth asking before you integrate</h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>Is Konfirm live with real funds?</summary>
              <p>
                Not yet. Konfirm runs on Stellar testnet today: every flow on this page works end-to-end, just not
                with mainnet funds.
              </p>
            </details>
            <details className="faq-item">
              <summary>Does Konfirm ever hold my money?</summary>
              <p>
                No. Konfirm is non-custodial: payouts settle straight to your own Stellar address through a 2-of-3
                multisig treasury contract, so no single key, including Konfirm&apos;s, can move funds alone.
              </p>
            </details>
            <details className="faq-item">
              <summary>What assets and wallets are supported?</summary>
              <p>
                XLM, USDC, and EURC, paid via a classic Stellar transfer or a SEP-7 wallet deep link, any wallet
                that supports it.
              </p>
            </details>
            <details className="faq-item">
              <summary>How does Konfirm know a payment is real?</summary>
              <p>
                Before anything is marked paid, a backend reconciler independently checks the transfer against
                Horizon, Stellar&apos;s network API. The frontend never gets the final word.
              </p>
            </details>
            <details className="faq-item">
              <summary>What&apos;s the Soroban payment channel for?</summary>
              <p>
                It&apos;s built for AI agents paying AI agents: the x402 pattern. Two agents open a channel, commit
                payments off-chain at high frequency, and settle once on-chain when they&apos;re done.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can I try it without real funds?</summary>
              <p>
                Yes: <Link href="/get-test-usdc">grab testnet USDC</Link> from our faucet, then run a full payment
                end-to-end.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="close">
        <div className="container close-row">
          <h2>Start on testnet. Build like it&apos;s mainnet.</h2>
          <div className="hero-actions">
            <Link href="/signup" className="btn">
              Create a merchant account
            </Link>
            <Link href="/docs" className="btn btn--quiet">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <footer className="letter-close">
        <div className="container">
          <p className="letter-close__mark">Konfirm</p>
          <p className="letter-close__line">A non-custodial payment processor on Stellar.</p>
          <nav aria-label="Footer">
            <Link href="/signup">Get started</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/get-test-usdc">Testnet USDC</Link>
          </nav>
          <p className="letter-close__legal">
            &ldquo;Stellar&rdquo; is a trademark of the Stellar Development Foundation. All rights reserved. Konfirm
            is independent software, not affiliated with, sponsored, or endorsed by the Stellar Development
            Foundation.
          </p>
        </div>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT }} />
    </article>
  );
}
