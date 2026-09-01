// Root layout: fonts, metadata and the single global stylesheet.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ToolFence — WebMCP tools for any web app, with a consent firewall",
  description:
    "ToolFence reads a page's accessibility tree, generates WebMCP tools at runtime, and blocks destructive tool calls until the user approves them.",
  openGraph: {
    title: "ToolFence",
    description:
      "Turn any web app into WebMCP tools — and never let a dangerous tool run without user consent.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Fonts are linked rather than bundled so a build never depends on
          reaching Google; every family has a real system fallback in
          globals.css, so a blocked request costs weight, not layout. */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
