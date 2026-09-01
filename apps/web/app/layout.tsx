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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
