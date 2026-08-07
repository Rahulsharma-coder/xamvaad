"use client";

import { useRouter } from "next/navigation";

/**
 * "Explore as Guest" — sets a cookie so the welcome screen is not shown again,
 * then drops the visitor on the home feed. No account is created; guest is
 * simply the unauthenticated state (PRD Part 7).
 */
export function GuestEntryButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function enter() {
    document.cookie = `xamvaad_seen_welcome=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={enter}
      className="inline-flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
    >
      {children}
    </button>
  );
}
