import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://konfirm.xyz"),
  title: {
    template: "%s · Konfirm",
    default: "Konfirm",
  },
  description: "A non-custodial payment processor on Stellar.",
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