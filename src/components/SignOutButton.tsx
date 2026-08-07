"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      router.push("/welcome");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm font-semibold text-object transition hover:bg-red-50 disabled:opacity-60"
    >
      <LogOut size={16} />
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}
