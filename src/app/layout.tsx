import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500"],
});

const description =
  "A cinematic digital observatory. Your skills and ideas as a living universe.";

export const metadata: Metadata = {
  // Locked future domain (CLAUDE.md). Resolves relative OG/Twitter image URLs
  // to absolute — social platforms require absolute URLs. Deployment is still
  // deferred; this only affects metadata URL resolution.
  metadataBase: new URL("https://eclipsebrainos.com"),
  title: "Eclipse Brain OS",
  description,
  openGraph: {
    title: "Eclipse Brain OS",
    description,
    images: [
      { url: "/logo.svg", width: 1200, height: 630, alt: "Eclipse Brain OS" },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Eclipse Brain OS",
    description,
    images: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
