import Link from "next/link";
import { ChevronLeft, Search, Shield } from "lucide-react";
import { Avatar } from "./Avatar";
import { LogoMark } from "./Logo";
import type { SessionUser } from "@/lib/auth";

/** Home header (wireframe 03): wordmark, search entry, profile. */
export function TopBar({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {/* Mark only. The wordmark beside it crowded the search field and
            repeated what the tab title already says. */}
        <Link href="/" aria-label="Xamvaad home" className="flex shrink-0">
          <LogoMark size={30} />
        </Link>

        <Link
          href="/search"
          className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-slate-400 transition hover:border-brand-300"
        >
          <Search size={16} />
          Search exams, boards...
        </Link>

        {/* Staff only. Ordinary aspirants never see this, and the /admin
            layout enforces the role again server-side — hiding the link is
            presentation, not the access check. */}
        {user && user.role !== "USER" && (
          <Link
            href="/admin"
            aria-label="Admin dashboard"
            title="Admin dashboard"
            className="shrink-0 rounded-lg p-2 text-brand-600 transition hover:bg-brand-50"
          >
            <Shield size={18} strokeWidth={2.3} />
          </Link>
        )}

        {user ? (
          <Link href="/profile" aria-label="Your profile">
            <Avatar name={user.name} image={user.image} size={32} />
          </Link>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

/** Back-navigation header used on detail screens (wireframes 05, 08, 09). */
export function DetailBar({
  title,
  backHref,
  action,
}: {
  title?: string;
  backHref: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link
          href={backHref}
          aria-label="Back"
          className="-ml-1 rounded-md p-1 text-ink transition hover:bg-slate-100"
        >
          <ChevronLeft size={22} />
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {title ?? "Back"}
        </span>
        {action}
      </div>
    </header>
  );
}
