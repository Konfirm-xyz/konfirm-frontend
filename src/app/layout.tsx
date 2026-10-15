import type { Metadata } from "next";
import "./globals.css";

// The canonical site origin. Set NEXT_PUBLIC_SITE_URL in the Vercel project
// to the real production domain; the fallback keeps local/dev builds working
// and lets Next resolve relative og:image paths against a stable base.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://konfirm.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Konfirm",
    template: "%s | Konfirm",
  },
  description: "A non-custodial payment processor on Stellar.",
  openGraph: {
    title: "Konfirm",
    description: "A non-custodial payment processor on Stellar.",
    siteName: "Konfirm",
    type: "website",
    images: [
      {
        url: "/og-pay.png",
        width: 1200,
        height: 630,
        alt: "Konfirm — a non-custodial payment processor on Stellar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Konfirm",
    description: "A non-custodial payment processor on Stellar.",
    images: ["/og-pay.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
