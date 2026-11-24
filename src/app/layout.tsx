import type { Metadata, Viewport } from "next";
import "./globals.css";
import RouteAnnouncer from "./RouteAnnouncer";
import ThemeToggle from "./ThemeToggle";
import SessionExpiryListener from "@/components/session-expiry-listener";

// Runs before paint so an explicit saved preference applies immediately --
// without this, the page would render in the system-preference theme for
// one frame, then flash to the user's actual saved choice.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("konfirm_theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  }
} catch (e) {}
`;

// Resolve the canonical base URL without silently mislabeling non-production
// deployments as the production domain. Priority:
//   1. NEXT_PUBLIC_BASE_URL (explicit, always wins)
//   2. VERCEL_URL (preview/staging deployments)
//   3. localhost in development
//   4. https://konfirm.xyz only when actually running in production
function resolveMetadataBase(): URL {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) {
    return new URL(explicit);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return new URL(`https://${vercelUrl}`);
  }

  if (process.env.NODE_ENV !== "production") {
    return new URL("http://localhost:3000");
  }

  return new URL("https://konfirm.xyz");
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    template: "%s · Konfirm",
    default: "Konfirm",
  },
  description: "A non-custodial payment processor on Stellar.",
};

// Matches --ink in globals.css so mobile browser chrome blends with the
// app's dark surface instead of defaulting to light.
export const viewport: Viewport = {
  themeColor: "#0a0908",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <RouteAnnouncer />
        <SessionExpiryListener />
        <main>{children}</main>
        <ThemeToggle />
      </body>
    </html>
  );
}