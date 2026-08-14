"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/client";

/**
 * One notification, which marks itself read when opened.
 *
 * The unread dot clears optimistically. Waiting for the round trip would leave
 * it lit through the navigation, which reads as "that didn't work" — and the
 * reader is already on their way to the post by then. A failed write puts the
 * dot back rather than silently pretending.
 *
 * Kept as a real Link when there is somewhere to go, so middle-click and
 * open-in-new-tab still behave. Notifications with no post — a window opening,
 * say — have nothing to navigate to, so they are a button that only clears.
 */
export function NotificationRow({
  id,
  isRead,
  href,
  children,
}: {
  id: string;
  isRead: boolean;
  href?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [read, setRead] = useState(isRead);

  function markRead() {
    if (read) return;
    setRead(true);
    api(`/api/notifications/${id}`, { method: "PATCH" })
      // Refresh so the count on the bottom-nav bell drops too.
      .then(() => router.refresh())
      .catch(() => setRead(false));
  }

  const className = clsx(
    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-canvas",
    !read && "bg-brand-50/40"
  );

  const content = (
    <>
      {children}
      {!read && (
        <span
          aria-label="Unread"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600"
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={markRead} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={markRead} className={className}>
      {content}
    </button>
  );
}
