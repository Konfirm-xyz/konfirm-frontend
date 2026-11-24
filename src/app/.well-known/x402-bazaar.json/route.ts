// Used to be a static file at public/.well-known/x402-bazaar.json — now
// generated live from the backend's registry (GET /bazaar/manifest) on
// every request, so a new approved listing shows up here immediately with
// no frontend deploy. Fetched directly from the backend's own origin, not
// through the /api/backend/* BFF rewrite — that rewrite exists to keep
// credentialed browser requests same-origin; external resource servers
// and facilitators fetching this manifest aren't browser sessions and
// have no cookie to protect.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4001";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/bazaar/manifest`, { cache: "no-store" });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Keep the body JSON even when the backend is down; external callers parse this.
    return new Response(JSON.stringify({ error: "bazaar manifest unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
