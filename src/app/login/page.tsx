import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { GoogleButton } from "@/components/GoogleButton";
import { BrandBanner } from "@/components/Logo";

export const metadata = { title: "Login" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-surface px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        {/* The banner carries the brand; a separate heading beside it only
            competed with it for the same job. */}
        <Link href="/welcome" aria-label="Xamvaad" className="block">
          <BrandBanner />
        </Link>

        <div className="mt-6 space-y-4">
          <GoogleButton />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-xs text-ink-muted">or</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>

          <Suspense fallback={<FormSkeleton />}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function FormSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg bg-canvas" />;
}
