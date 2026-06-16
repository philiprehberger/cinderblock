import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cinderblock — the Supabase multi-tenant starter with a tested RLS suite",
    template: "%s · Cinderblock",
  },
  description:
    "Most Supabase multi-tenant deliveries leak. Cinderblock doesn't — and the 74-test pgtap suite proves it. Forkable template, live policy viewer, doubly-logged impersonation.",
  metadataBase: new URL("https://cinderblock.philiprehberger.com"),
  openGraph: {
    title: "Cinderblock — multi-tenant Supabase starter",
    description:
      "74 pgtap tests against a hostile 5×8 fixture. Append-only audit at the grant level. Doubly-logged impersonation. Forkable template.",
    url: "https://cinderblock.philiprehberger.com",
    siteName: "Cinderblock",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
