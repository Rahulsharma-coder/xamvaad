import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { BrandBanner } from "@/components/Logo";
import { GuestEntryButton } from "@/components/GuestEntry";
import { GoogleButton } from "@/components/GoogleButton";

export const metadata = { title: "Welcome" };

/** Landing screen — wireframe 02. */
export default async function WelcomePage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col bg-surface px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        {/* The banner is the whole masthead — the placeholder illustration it
            replaced was standing in for artwork that never arrived, and read
            as a skeleton loader that had got stuck. */}
        <BrandBanner className="mt-2" />

        <p className="mt-6 text-center text-sm text-ink-muted">
          Discuss. Vote. Solve Doubts.
        </p>

        <div className="mt-6 space-y-3">
          <GoogleButton />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-xs text-ink-muted">or</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/login"
              className="rounded-lg border border-hairline px-4 py-2.5 text-center text-sm font-semibold text-ink transition hover:bg-canvas"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-lg border border-hairline px-4 py-2.5 text-center text-sm font-semibold text-ink transition hover:bg-canvas"
            >
              Create Account
            </Link>
          </div>

          <GuestEntryButton>
            <Eye size={16} />
            Explore as Guest
          </GuestEntryButton>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-sm text-center text-[11px] leading-relaxed text-ink-muted">
        Xamvaad organises community discussion. It complements official exam
        authorities and does not replace them.
      </p>
    </div>
  );
}
