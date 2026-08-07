import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Shield } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DetailBar } from "@/components/TopBar";
import { SignOutButton } from "@/components/SignOutButton";
import { ProfileForm } from "@/components/ProfileForm";
import { PasswordForm } from "@/components/PasswordForm";

export const metadata = { title: "Settings" };

/** Settings (PRD Part 5) — profile, password, account details and sign-out. */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");

  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    // The hash itself never leaves the server — only whether one exists.
    select: { bio: true, passwordHash: true, googleId: true },
  });

  return (
    <div className="page-shell">
      <DetailBar title="Settings" backHref="/profile" />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <ProfileForm
          initialName={user.name}
          initialBio={account.bio ?? ""}
          initialImage={user.image}
        />

        <PasswordForm hasPassword={Boolean(account.passwordHash)} />

        <section className="rounded-xl border border-hairline bg-surface p-4">
          <h2 className="text-sm font-bold text-ink">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Username" value={`@${user.username}`} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={roleLabel(user.role)} />
            <Row
              label="Sign-in methods"
              value={signInMethods(
                Boolean(account.googleId),
                Boolean(account.passwordHash)
              )}
            />
          </dl>
        </section>

        {/* Staff only — the /admin layout checks the role again server-side. */}
        {user.role !== "USER" && (
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4 transition hover:border-brand-300"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Shield size={17} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">
                Admin dashboard
              </span>
              <span className="block text-xs text-ink-muted">
                Exam lifecycle, answer keys, reports and users
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-muted" />
          </Link>
        )}

        <section className="rounded-xl border border-hairline bg-surface p-4">
          <h2 className="text-sm font-bold text-ink">About Xamvaad</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Xamvaad organises community discussion around competitive exams. It
            complements official exam authorities and does not replace them.
            Objection percentages reflect community opinion only — objections
            must still be filed on the official portal.
          </p>
        </section>

        <SignOutButton />
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate font-medium text-ink">{value}</dd>
    </div>
  );
}

function signInMethods(hasGoogle: boolean, hasPassword: boolean) {
  const methods = [
    hasGoogle && "Google",
    hasPassword && "Email & password",
  ].filter(Boolean) as string[];
  return methods.join(", ") || "None";
}

function roleLabel(role: string) {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "MODERATOR":
      return "Moderator";
    case "BOARD_MODERATOR":
      return "Board Moderator";
    default:
      return "Registered User";
  }
}
