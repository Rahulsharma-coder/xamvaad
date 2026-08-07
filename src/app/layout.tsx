import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { ProgressBar } from "@/components/ProgressBar";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Xamvaad — Where Aspirants Discuss",
    template: "%s · Xamvaad",
  },
  description:
    "Structured discussion for competitive exam aspirants. Every post belongs to a board, exam, date and shift — searchable long after the exam cycle ends.",
  applicationName: "Xamvaad",
  // The tab icon itself is picked up from app/icon.svg and app/favicon.ico by
  // filename convention; this is the iOS standalone chrome.
  appleWebApp: { capable: true, title: "Xamvaad", statusBarStyle: "default" },
  openGraph: {
    title: "Xamvaad — Where Aspirants Discuss",
    description:
      "Structured discussion for competitive exam aspirants: memory questions, objection tracking and cutoff estimates, organised by exam, phase and shift.",
    siteName: "Xamvaad",
    images: ["/logo-mark.png"],
    type: "website",
  },
};

/**
 * Every screen reads the session cookie and live data, so nothing is
 * prerendered. This also lets `next build` succeed without a database.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Badge on the bottom nav; guests never have unread notifications.
  const unread = user
    ? await db.notification
        .count({ where: { userId: user.id, isRead: false } })
        .catch(() => 0)
    : 0;

  return (
    <html lang="en">
      <body>
        {/* Its own boundary: useSearchParams needs one, and keeping it a
            sibling of {children} means it never wraps the page — a boundary
            around the page is what breaks notFound()'s 404 status. */}
        <Suspense fallback={null}>
          <ProgressBar />
        </Suspense>

        {children}
        <BottomNav
          unreadCount={unread}
          user={user ? { name: user.name, image: user.image } : null}
        />
      </body>
    </html>
  );
}
