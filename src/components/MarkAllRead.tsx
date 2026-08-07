"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await api("/api/notifications", { method: "PATCH" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={busy}
      className="text-xs font-semibold text-brand-600 transition hover:underline disabled:opacity-50"
    >
      {busy ? "Marking..." : "Mark all as read"}
    </button>
  );
}
