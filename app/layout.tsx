import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";

// Outfit is the single typeface (DESIGN.md §1), loaded via next/font and set on
// <body> through the --font-outfit-sans CSS variable the @theme font ramp reads.
const outfit = Outfit({
  variable: "--font-outfit-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Swim Tracker",
  description:
    "Coach tool for tracking swimmers' personal bests, progression, and readiness against qualifying standards.",
};

// Stated rather than inherited from the framework default, because the phone
// layout depends on it: without `width=device-width` mobile Safari lays the app
// out at 980px and scales the result down, which is the desktop status matrix
// shrunk to illegibility rather than the stacked card list.
//
// No `maximumScale` / `userScalable` — pinch-zoom stays available. The one thing
// that USED to zoom this app on its own (a focused 14px input) is fixed in
// globals.css by making touch-width controls 16px, not by forbidding the zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${outfit.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col font-sans">
          <ConvexClientProvider>{children}</ConvexClientProvider>
          {/* One Toaster app-wide (Step 3.5). notify.* everywhere routes here. */}
          <Toaster />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
