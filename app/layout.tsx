import type { Metadata } from "next";
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
